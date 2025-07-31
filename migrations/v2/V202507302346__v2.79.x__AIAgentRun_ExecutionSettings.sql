-- ===============================================================================================================
-- Create date: 2025-07-31
-- Description: Add execution settings columns to AIAgentRun table to persist all ExecuteAgentParams settings
-- ===============================================================================================================

-- Add all new columns in a single ALTER TABLE statement
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun]
ADD 
    [ConfigurationID] uniqueidentifier NULL,
    [OverrideModelID] uniqueidentifier NULL,
    [OverrideVendorID] uniqueidentifier NULL,
    [Data] nvarchar(MAX) NULL,
    [Verbose] bit NULL DEFAULT 0;

-- Add foreign key constraints in a single ALTER TABLE statement
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun]
ADD CONSTRAINT [FK_AIAgentRun_ConfigurationID] 
    FOREIGN KEY ([ConfigurationID]) 
    REFERENCES [${flyway:defaultSchema}].[AIConfiguration]([ID]),
CONSTRAINT [FK_AIAgentRun_OverrideModelID] 
    FOREIGN KEY ([OverrideModelID]) 
    REFERENCES [${flyway:defaultSchema}].[AIModel]([ID]),
CONSTRAINT [FK_AIAgentRun_OverrideVendorID] 
    FOREIGN KEY ([OverrideVendorID]) 
    REFERENCES [${flyway:defaultSchema}].[AIVendor]([ID]);

-- Add extended properties for all new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The AI Configuration used for this agent execution. When set, this configuration was used for all prompts executed by this agent and its sub-agents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'ConfigurationID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Runtime model override that was used for this execution. When set, this model took precedence over all other model selection methods.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'OverrideModelID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Runtime vendor override that was used for this execution. When set along with OverrideModelID, this vendor was used to provide the model.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'OverrideVendorID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON serialized data that was passed for template rendering and prompt execution. This data was passed to the agent''s prompt as well as all sub-agents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'Data';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates whether verbose logging was enabled during this agent execution. When true, detailed decision-making and execution flow was logged.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'Verbose';

-- Note: We intentionally do NOT store APIKeys or Context for security reasons
-- Context can contain secrets and sensitive information
-- MemberJunction will handle EntityField metadata creation through CodeGen after this migration

-- ===============================================================================================================
-- End of migration
-- ===============================================================================================================