-- =============================================
-- Migration: V202510311200__v2.114.x_Add_Agent_Configuration_Presets.sql
-- Description: Add AI Agent Configuration table for semantic configuration presets
-- This enables user-friendly configuration selection (e.g., "Fast", "High Quality")
-- for agent execution without requiring users to understand technical configuration IDs.
-- =============================================

-- Create AIAgentConfiguration table
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
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_AIAgentConfiguration_Agent]
        FOREIGN KEY ([AgentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentConfiguration_Configuration]
        FOREIGN KEY ([AIConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration]([ID]),
    CONSTRAINT [CK_AIAgentConfiguration_Status]
        CHECK ([Status] IN ('Pending', 'Active', 'Revoked')),
    CONSTRAINT [UQ_AIAgentConfiguration_Agent_Name]
        UNIQUE ([AgentID], [Name])
);

-- Create indexes for performance
CREATE INDEX [IX_AIAgentConfiguration_AgentID_Status]
    ON [${flyway:defaultSchema}].[AIAgentConfiguration]([AgentID], [Status]);

-- Add extended properties for table
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines semantic configuration presets for agents, allowing users to select between different AI model configurations (e.g., Fast, Balanced, High Quality) when executing an agent. Each preset maps to an AI Configuration which controls model selection across all prompts.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration';

-- Add extended properties for columns
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The agent this configuration preset belongs to',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentConfiguration',
    @level2type = N'COLUMN', @level2name = N'AgentID';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Code-friendly name for the preset (e.g., HighPower, Fast, Balanced). Used in API calls.',
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
    @value = N'Optional AI Configuration to use for this preset. If NULL, uses default configuration (prompts with ConfigurationID IS NULL)',
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

-- Grant permissions (follow standard MemberJunction permission pattern)
-- CodeGen will create the stored procedures (spCreateAIAgentConfiguration, spUpdateAIAgentConfiguration, spDeleteAIAgentConfiguration)
-- and the view (vwAIAgentConfigurations) automatically
