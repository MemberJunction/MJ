-- =============================================
-- Migration: Add AI Agent Configuration Table
-- Description: Adds AIAgentConfiguration table for semantic configuration presets
-- Version: 2.117.x
-- Date: 2025-11-07
-- =============================================

-- Create the AIAgentConfiguration table
CREATE TABLE [${flyway:defaultSchema}].[AIAgentConfiguration] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [AgentID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [DisplayName] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [AIConfigurationID] UNIQUEIDENTIFIER NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [Priority] INT NOT NULL DEFAULT 100,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',

    CONSTRAINT [FK_AIAgentConfiguration_Agent]
        FOREIGN KEY ([AgentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentConfiguration_Configuration]
        FOREIGN KEY ([AIConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration]([ID]),
    CONSTRAINT [CK_AIAgentConfiguration_Status]
        CHECK ([Status] IN ('Pending', 'Active', 'Revoked')),
    CONSTRAINT [UQ_AIAgentConfiguration_Agent_Name]
        UNIQUE ([AgentID], [Name])
);
 

-- Add extended properties for table documentation
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines semantic configuration presets for agents, allowing users to select between different AI model configurations (e.g., Fast, Balanced, High Quality) when executing an agent. Each preset maps to an AI Configuration which controls model selection across all prompts.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration';

-- Add extended properties for columns
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary Key - Unique identifier for the agent configuration preset',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign Key - The agent this configuration preset belongs to',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AgentID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Code-friendly name for the preset (e.g., HighPower, Fast, Balanced). Used in API calls and metadata references.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User-friendly display name shown in UI (e.g., "High Quality", "Quick Draft", "Maximum Detail")',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description shown to users explaining what this configuration does (e.g., "Uses Claude Opus for highest quality results")',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign Key - Optional AI Configuration to use for this preset. If NULL, uses default configuration (prompts with ConfigurationID IS NULL)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AIConfigurationID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this is the default preset for the agent. Should have exactly one default per agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order for UI. Lower numbers appear first. Typical values: 100 (Default), 200 (Fast), 300 (Balanced), 400 (High Quality)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the preset: Pending (being configured), Active (available for use), Revoked (no longer available)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'Status';






























































-- CODE GEN RUN
/* SQL generated to create new entity MJ: AI Agent Configurations */

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
         '9d04da94-4c76-4f71-bb83-34e5b6fed1a3',
         'MJ: AI Agent Configurations',
         'AI Agent Configurations',
         NULL,
         NULL,
         'AIAgentConfiguration',
         'vwAIAgentConfigurations',
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
   

/* SQL generated to add new entity MJ: AI Agent Configurations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9d04da94-4c76-4f71-bb83-34e5b6fed1a3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Configurations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9d04da94-4c76-4f71-bb83-34e5b6fed1a3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Configurations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9d04da94-4c76-4f71-bb83-34e5b6fed1a3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Configurations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9d04da94-4c76-4f71-bb83-34e5b6fed1a3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentConfiguration] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentConfiguration] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1e97542e-6cc4-4dba-a342-fd120bffc236'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'ID')
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
            '1e97542e-6cc4-4dba-a342-fd120bffc236',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100001,
            'ID',
            'ID',
            'Primary Key - Unique identifier for the agent configuration preset',
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
         WHERE ID = '9ade142a-8124-4a20-9048-8b4e8a6c58bb'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'AgentID')
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
            '9ade142a-8124-4a20-9048-8b4e8a6c58bb',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100002,
            'AgentID',
            'Agent ID',
            'Foreign Key - The agent this configuration preset belongs to',
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
         WHERE ID = 'b145788f-5f28-4196-8f78-90b016bf7c13'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'Name')
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
            'b145788f-5f28-4196-8f78-90b016bf7c13',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100003,
            'Name',
            'Name',
            'Code-friendly name for the preset (e.g., HighPower, Fast, Balanced). Used in API calls and metadata references.',
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
         WHERE ID = 'e8932d11-ecc8-4c98-b90a-82078eb30485'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'DisplayName')
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
            'e8932d11-ecc8-4c98-b90a-82078eb30485',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100004,
            'DisplayName',
            'Display Name',
            'User-friendly display name shown in UI (e.g., "High Quality", "Quick Draft", "Maximum Detail")',
            'nvarchar',
            400,
            0,
            0,
            0,
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
         WHERE ID = '92adcfe6-207b-473b-bb42-9576103cf396'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'Description')
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
            '92adcfe6-207b-473b-bb42-9576103cf396',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100005,
            'Description',
            'Description',
            'Description shown to users explaining what this configuration does (e.g., "Uses Claude Opus for highest quality results")',
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
         WHERE ID = '2350858f-d674-4207-a745-f877a7047e55'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'AIConfigurationID')
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
            '2350858f-d674-4207-a745-f877a7047e55',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100006,
            'AIConfigurationID',
            'AI Configuration ID',
            'Foreign Key - Optional AI Configuration to use for this preset. If NULL, uses default configuration (prompts with ConfigurationID IS NULL)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '6AE1BBF0-2085-4D2F-B724-219DC4212026',
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
         WHERE ID = '1a5dd4bb-a790-4f98-a726-c96570ba91b3'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'IsDefault')
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
            '1a5dd4bb-a790-4f98-a726-c96570ba91b3',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100007,
            'IsDefault',
            'Is Default',
            'Whether this is the default preset for the agent. Should have exactly one default per agent.',
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
         WHERE ID = '9b501aab-6d75-487b-9f83-e294c5ea9a42'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'Priority')
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
            '9b501aab-6d75-487b-9f83-e294c5ea9a42',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100008,
            'Priority',
            'Priority',
            'Display order for UI. Lower numbers appear first. Typical values: 100 (Default), 200 (Fast), 300 (Balanced), 400 (High Quality)',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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
         WHERE ID = '847954df-117d-4d1b-a9ad-00f4707630bc'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'Status')
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
            '847954df-117d-4d1b-a9ad-00f4707630bc',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100009,
            'Status',
            'Status',
            'Status of the preset: Pending (being configured), Active (available for use), Revoked (no longer available)',
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
         WHERE ID = '596cae86-bfaa-4c16-a272-c8807605b3bc'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = '__mj_CreatedAt')
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
            '596cae86-bfaa-4c16-a272-c8807605b3bc',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100010,
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
         WHERE ID = '7421ea71-61d4-4f64-a2f0-28f62978cece'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = '__mj_UpdatedAt')
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
            '7421ea71-61d4-4f64-a2f0-28f62978cece',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100011,
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

/* SQL text to insert entity field value with ID c40acff9-e7fd-483a-b74a-d91c01a0ab15 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c40acff9-e7fd-483a-b74a-d91c01a0ab15', '847954DF-117D-4D1B-A9AD-00F4707630BC', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 96187265-48bc-4fbc-869e-ecf3fa43f03e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('96187265-48bc-4fbc-869e-ecf3fa43f03e', '847954DF-117D-4D1B-A9AD-00F4707630BC', 2, 'Pending', 'Pending')

/* SQL text to insert entity field value with ID 6798c8eb-dc77-4a0a-81b5-25d2f99ec321 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6798c8eb-dc77-4a0a-81b5-25d2f99ec321', '847954DF-117D-4D1B-A9AD-00F4707630BC', 3, 'Revoked', 'Revoked')

/* SQL text to update ValueListType for entity field ID 847954DF-117D-4D1B-A9AD-00F4707630BC */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='847954DF-117D-4D1B-A9AD-00F4707630BC'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '93c5809e-dcb4-43d4-80f1-1e38ba91d4ad'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('93c5809e-dcb4-43d4-80f1-1e38ba91d4ad', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', 'AIConfigurationID', 'One To Many', 1, 1, 'MJ: AI Agent Configurations', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '24885fc3-90fa-49e0-8131-125bdc7203f7'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('24885fc3-90fa-49e0-8131-125bdc7203f7', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Configurations', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID 9306493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9306493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID BD06493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BD06493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 3F06493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3F06493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID BE04493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BE04493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 2E05493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2E05493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 5406493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5406493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 5B06493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5B06493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6206493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6206493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID FD04493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FD04493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID C105493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C105493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 0405493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0405493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 0B05493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0B05493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for EntityFieldValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFieldValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID ON [${flyway:defaultSchema}].[EntityFieldValue] ([EntityFieldID]);

/* Base View Permissions SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: Permissions for vwEntityFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFieldValues] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: spCreateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue]
    @ID uniqueidentifier = NULL,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [ID],
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for Entity Field Values */




/* spUpdate SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: spUpdateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue]
    @ID uniqueidentifier,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        [EntityFieldID] = @EntityFieldID,
        [Sequence] = @Sequence,
        [Value] = @Value,
        [Code] = @Code,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFieldValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFieldValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFieldValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFieldValue
ON [${flyway:defaultSchema}].[EntityFieldValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFieldValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Field Values */




/* spDelete SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: spDeleteEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFieldValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Entity Field Values */




/* Index for Foreign Keys for AIAgentConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentConfiguration_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentConfiguration_AgentID ON [${flyway:defaultSchema}].[AIAgentConfiguration] ([AgentID]);

-- Index for foreign key AIConfigurationID in table AIAgentConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentConfiguration_AIConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentConfiguration_AIConfigurationID ON [${flyway:defaultSchema}].[AIAgentConfiguration] ([AIConfigurationID]);

/* SQL text to update entity field related entity name field map for entity field ID 9ADE142A-8124-4A20-9048-8B4E8A6C58BB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9ADE142A-8124-4A20-9048-8B4E8A6C58BB',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID 2350858F-D674-4207-A745-F877A7047E55 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2350858F-D674-4207-A745-F877A7047E55',
         @RelatedEntityNameFieldMap='AIConfiguration'

/* Base View SQL for MJ: AI Agent Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: vwAIAgentConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentConfigurations]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_AIConfigurationID.[Name] AS [AIConfiguration]
FROM
    [${flyway:defaultSchema}].[AIAgentConfiguration] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_AIConfigurationID
  ON
    [a].[AIConfigurationID] = AIConfiguration_AIConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: Permissions for vwAIAgentConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: spCreateAIAgentConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentConfiguration]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @Name nvarchar(100),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @AIConfigurationID uniqueidentifier,
    @IsDefault bit = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentConfiguration]
            (
                [ID],
                [AgentID],
                [Name],
                [DisplayName],
                [Description],
                [AIConfigurationID],
                [IsDefault],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @Name,
                @DisplayName,
                @Description,
                @AIConfigurationID,
                ISNULL(@IsDefault, 0),
                ISNULL(@Priority, 100),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentConfiguration]
            (
                [AgentID],
                [Name],
                [DisplayName],
                [Description],
                [AIConfigurationID],
                [IsDefault],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @Name,
                @DisplayName,
                @Description,
                @AIConfigurationID,
                ISNULL(@IsDefault, 0),
                ISNULL(@Priority, 100),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: spUpdateAIAgentConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Name nvarchar(100),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @AIConfigurationID uniqueidentifier,
    @IsDefault bit,
    @Priority int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentConfiguration]
    SET
        [AgentID] = @AgentID,
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AIConfigurationID] = @AIConfigurationID,
        [IsDefault] = @IsDefault,
        [Priority] = @Priority,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentConfiguration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentConfiguration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentConfiguration
ON [${flyway:defaultSchema}].[AIAgentConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: spDeleteAIAgentConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 9707493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9707493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 9D07493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9D07493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 3407493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3407493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 4807493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4807493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 4D07493E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4D07493E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '084a72d3-056a-4b7a-9fc0-038c031ecc9a'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'Agent')
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
            '084a72d3-056a-4b7a-9fc0-038c031ecc9a',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100023,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5a752a8e-c511-469c-b062-3a7d6d0c3fb0'  OR 
               (EntityID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3' AND Name = 'AIConfiguration')
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
            '5a752a8e-c511-469c-b062-3a7d6d0c3fb0',
            '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', -- Entity: MJ: AI Agent Configurations
            100024,
            'AIConfiguration',
            'AI Configuration',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'C34D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C34D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C54D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E8932D11-ECC8-4C98-B90A-82078EB30485'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B145788F-5F28-4196-8F78-90B016BF7C13'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E8932D11-ECC8-4C98-B90A-82078EB30485'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1A5DD4BB-A790-4F98-A726-C96570BA91B3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9B501AAB-6D75-487B-9F83-E294C5EA9A42'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '847954DF-117D-4D1B-A9AD-00F4707630BC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '084A72D3-056A-4B7A-9FC0-038C031ECC9A'
            AND AutoUpdateDefaultInView = 1
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1E97542E-6CC4-4DBA-A342-FD120BFFC236'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9ADE142A-8124-4A20-9048-8B4E8A6C58BB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B145788F-5F28-4196-8F78-90B016BF7C13'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E8932D11-ECC8-4C98-B90A-82078EB30485'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '92ADCFE6-207B-473B-BB42-9576103CF396'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2350858F-D674-4207-A745-F877A7047E55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '084A72D3-056A-4B7A-9FC0-038C031ECC9A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preset Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A752A8E-C511-469C-B062-3A7D6D0C3FB0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operational Settings',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A5DD4BB-A790-4F98-A726-C96570BA91B3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operational Settings',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B501AAB-6D75-487B-9F83-E294C5EA9A42'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operational Settings',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '847954DF-117D-4D1B-A9AD-00F4707630BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '596CAE86-BFAA-4C16-A272-C8807605B3BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7421EA71-61D4-4F64-A2F0-28F62978CECE'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-robot */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-robot',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3'
               

/* Insert FieldCategoryIcons setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES (NEWID(), '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', 'FieldCategoryIcons', '{"Preset Definition":"fa fa-sliders-h","Operational Settings":"fa fa-flag","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C14D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D65717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D75717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Lookup Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Lookup Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Lookup Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Lookup Definition',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C54D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Association',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '524E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Association',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Association',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4229BDD0-8436-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Association',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A7BB74B4-7F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryIcons setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Lookup Definition":"fa fa-list","Entity Association":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'FC238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

