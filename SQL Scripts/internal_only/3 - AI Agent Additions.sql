-- ---------------------------------------------------------------------------
-- MemberJunction AI Agent Enhancement Schema
-- 
-- This script enhances the AIAgent table and creates AIAgentPrompt table to support:
-- 1. Hierarchical agent structure (conductor pattern)
-- 2. Agent-prompt associations
-- 3. Context management and compression
-- 4. Structured output validation
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TRANSACTION 1: Table Enhancements and Creation
-- This transaction enhances AIAgent and creates AIAgentPrompt
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;

    -- ---------------------------------------------------------------------------
    -- Enhance AIAgent table with hierarchical structure and context compression
    -- ---------------------------------------------------------------------------
    ALTER TABLE [__mj].[AIAgent] ADD
        -- Hierarchical structure fields
        [ParentID] [uniqueidentifier] NULL,                          -- References parent agent for hierarchical structure
        [ExposeAsAction] [bit] NOT NULL DEFAULT(0),                  -- When true, expose this agent as an action
        [ExecutionOrder] [int] NOT NULL DEFAULT(0),                  -- Order of execution among siblings
        [ExecutionMode] [nvarchar](20) NOT NULL DEFAULT('Sequential'), -- Controls how this agent's child agents are executed
        
        -- Context compression fields
        [EnableContextCompression] [bit] NOT NULL DEFAULT(0),                   -- Enable automatic context compression
        [ContextCompressionMessageThreshold] [int] NULL,                        -- # of messages that triggers compression
        [ContextCompressionPromptID] [uniqueidentifier] NULL,                   -- Prompt used for compression
        [ContextCompressionMessageRetentionCount] [int] NULL;                   -- # of recent messages to keep uncompressed

    -- ---------------------------------------------------------------------------
    -- Create AIAgentPrompt table for agent-prompt associations
    -- ---------------------------------------------------------------------------
    CREATE TABLE [__mj].[AIAgentPrompt](
        [ID] [uniqueidentifier] NOT NULL DEFAULT(newsequentialid()),  -- Primary key
        [AgentID] [uniqueidentifier] NOT NULL,                         -- The agent this prompt belongs to
        [PromptID] [uniqueidentifier] NOT NULL,                        -- The prompt to use
        [Purpose] [nvarchar](max)  NULL,                               -- Functional purpose (e.g., "Initialize", "ProcessData")
        [ExecutionOrder] [int] NOT NULL DEFAULT(0),                    -- Sequence within the agent's workflow
        [ConfigurationID] [uniqueidentifier] NULL,                     -- Optional specific configuration to use
        [Status] [nvarchar](20) NOT NULL DEFAULT('Active'),            -- Status of this agent-prompt mapping
        [ContextBehavior] [nvarchar](50) NOT NULL DEFAULT('Complete'), -- How this prompt filters conversation context
        [ContextMessageCount] [int] NULL,                              -- The N value for message filtering
        CONSTRAINT [PK_AIAgentPrompt_ID] PRIMARY KEY ([ID])
    );

    -- ---------------------------------------------------------------------------
    -- Enhance AIPrompt table with structured output validation
    -- ---------------------------------------------------------------------------
    ALTER TABLE [__mj].[AIPrompt] ADD
        [OutputType] [nvarchar](50) NOT NULL DEFAULT('string'),        -- string, number, boolean, date, object
        [OutputExample] [nvarchar](max) NULL,                          -- JSON Example output to validate against when OutputType is 'object'
        [ValidationBehavior] [nvarchar](50) NOT NULL DEFAULT('Warn');  -- Strict, Warn, None

    -- ---------------------------------------------------------------------------
    -- Enhance AIConfiguration table with default prompts
    -- ---------------------------------------------------------------------------
    ALTER TABLE [__mj].[AIConfiguration] ADD
        [DefaultPromptForContextCompressionID] [uniqueidentifier] NULL,   -- Default prompt for context compression
        [DefaultPromptForContextSummarizationID] [uniqueidentifier] NULL; -- Default prompt for context summarization
        
    -- Add unique constraint for agent-prompt combinations
    ALTER TABLE [__mj].[AIAgentPrompt] ADD CONSTRAINT [UQ_AIAgentPrompt_Agent_Prompt_Config] 
        UNIQUE ([AgentID], [PromptID], [ConfigurationID]);
        
    COMMIT TRANSACTION;
    PRINT 'Structure changes committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error in structure changes: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO -- Separate transaction batches

-- ---------------------------------------------------------------------------
-- TRANSACTION 2: Constraints and Relationships
-- This transaction adds constraints and foreign keys
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;
    
    -- ---------------------------------------------------------------------------
    -- AIAgent constraints
    -- ---------------------------------------------------------------------------
    
    -- Add foreign key to self for parent-child relationship
    ALTER TABLE [__mj].[AIAgent] WITH CHECK ADD CONSTRAINT [FK_AIAgent_ParentID] 
        FOREIGN KEY([ParentID]) REFERENCES [__mj].[AIAgent] ([ID]);
    
    ALTER TABLE [__mj].[AIAgent] CHECK CONSTRAINT [FK_AIAgent_ParentID];
    
    -- Add foreign key to AIPrompt for compression prompt
    ALTER TABLE [__mj].[AIAgent] WITH CHECK ADD CONSTRAINT [FK_AIAgent_ContextCompressionPromptID] 
        FOREIGN KEY([ContextCompressionPromptID]) REFERENCES [__mj].[AIPrompt] ([ID]);
    
    ALTER TABLE [__mj].[AIAgent] CHECK CONSTRAINT [FK_AIAgent_ContextCompressionPromptID];
    
    -- Ensure only root nodes can be exposed as actions
    ALTER TABLE [__mj].[AIAgent] ADD CONSTRAINT [CK_AIAgent_ExposeAsAction]
        CHECK ((ParentID IS NULL) OR (ExposeAsAction = 0));
    
    -- Add check constraint on ExecutionMode
    ALTER TABLE [__mj].[AIAgent] ADD CONSTRAINT [CK_AIAgent_ExecutionMode]
        CHECK ([ExecutionMode] IN (N'Sequential', N'Parallel'));
    
    -- Ensure compression fields are provided if compression is enabled
    ALTER TABLE [__mj].[AIAgent] ADD CONSTRAINT [CK_AIAgent_CompressionFields]
        CHECK (([EnableContextCompression] = 0) OR 
               ([ContextCompressionMessageThreshold] IS NOT NULL AND 
                [ContextCompressionPromptID] IS NOT NULL AND
                [ContextCompressionMessageRetentionCount] IS NOT NULL));
    
    -- ---------------------------------------------------------------------------
    -- AIAgentPrompt constraints
    -- ---------------------------------------------------------------------------
    
    -- Add foreign keys
    ALTER TABLE [__mj].[AIAgentPrompt] WITH CHECK ADD CONSTRAINT [FK_AIAgentPrompt_AgentID] 
        FOREIGN KEY([AgentID]) REFERENCES [__mj].[AIAgent]([ID]);
    
    ALTER TABLE [__mj].[AIAgentPrompt] CHECK CONSTRAINT [FK_AIAgentPrompt_AgentID];
    
    ALTER TABLE [__mj].[AIAgentPrompt] WITH CHECK ADD CONSTRAINT [FK_AIAgentPrompt_PromptID] 
        FOREIGN KEY([PromptID]) REFERENCES [__mj].[AIPrompt]([ID]);
    
    ALTER TABLE [__mj].[AIAgentPrompt] CHECK CONSTRAINT [FK_AIAgentPrompt_PromptID];
    
    ALTER TABLE [__mj].[AIAgentPrompt] WITH CHECK ADD CONSTRAINT [FK_AIAgentPrompt_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [__mj].[AIConfiguration]([ID]);
    
    ALTER TABLE [__mj].[AIAgentPrompt] CHECK CONSTRAINT [FK_AIAgentPrompt_ConfigurationID];
    
    -- Status constraint
    ALTER TABLE [__mj].[AIAgentPrompt] ADD CONSTRAINT [CK_AIAgentPrompt_Status]
        CHECK ([Status] IN ('Active', 'Inactive', 'Deprecated', 'Preview'));
    
    -- Context behavior constraint
    ALTER TABLE [__mj].[AIAgentPrompt] ADD CONSTRAINT [CK_AIAgentPrompt_ContextBehavior]
        CHECK ([ContextBehavior] IN (
            'Complete',        -- Include the complete conversation history
            'Smart',           -- Intelligently filter for relevant messages
            'None',            -- No conversation history
            'RecentMessages',  -- Only include the most recent N messages
            'InitialMessages', -- Only include the first N messages
            'Custom'           -- Custom filtering logic
        ));
    
    -- Ensure MessageCount is provided when needed
    ALTER TABLE [__mj].[AIAgentPrompt] ADD CONSTRAINT [CK_AIAgentPrompt_ContextMessageCount]
        CHECK (([ContextBehavior] NOT IN ('RecentMessages', 'InitialMessages')) 
            OR ([ContextMessageCount] IS NOT NULL));
    
    -- ---------------------------------------------------------------------------
    -- AIPrompt constraints for structured output
    -- ---------------------------------------------------------------------------
    
    -- Add check constraint on OutputType
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_OutputType]
        CHECK ([OutputType] IN ('string', 'number', 'boolean', 'date', 'object'));
    
    -- Ensure schema is provided for object output type
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_OutputExample]
        CHECK (([OutputType] <> 'object') OR ([OutputExample] IS NOT NULL));

    -- Add check constraint on ValidationBehavior
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ValidationBehavior]
        CHECK ([ValidationBehavior] IN ('Strict', 'Warn', 'None'));
    
    -- ---------------------------------------------------------------------------
    -- AIConfiguration constraints for default prompts
    -- ---------------------------------------------------------------------------
    
    -- Add foreign keys for default prompts
    ALTER TABLE [__mj].[AIConfiguration] WITH CHECK ADD CONSTRAINT [FK_AIConfiguration_DefaultPromptForContextCompressionID] 
        FOREIGN KEY([DefaultPromptForContextCompressionID]) REFERENCES [__mj].[AIPrompt]([ID]);
    
    ALTER TABLE [__mj].[AIConfiguration] WITH CHECK ADD CONSTRAINT [FK_AIConfiguration_DefaultPromptForContextSummarizationID] 
        FOREIGN KEY([DefaultPromptForContextSummarizationID]) REFERENCES [__mj].[AIPrompt]([ID]);
    
    COMMIT TRANSACTION;
    PRINT 'Constraints and relationships committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error in constraints and relationships: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO

-- ---------------------------------------------------------------------------
-- Extended properties for documentation
-- ---------------------------------------------------------------------------

-- AIAgent new columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the parent agent in the hierarchical structure. If NULL, this is a root (top-level) agent.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ParentID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, this agent can be exposed as an action for use by other agents. Only valid for root agents.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ExposeAsAction'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The order in which this agent should be executed among its siblings under the same parent.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ExecutionOrder'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Controls how this agent''s child agents are executed. Sequential runs children in order, Parallel runs them simultaneously.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ExecutionMode'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, enables automatic compression of conversation context when the message threshold is reached.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'EnableContextCompression'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of messages that triggers context compression when EnableContextCompression is true.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ContextCompressionMessageThreshold'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of recent messages to keep uncompressed when context compression is applied.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ContextCompressionMessageRetentionCount'

-- AIAgentPrompt table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Links AI agents with the prompts they use, including execution order and context handling.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the agent this prompt is associated with.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'AgentID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the prompt to be used by the agent.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'PromptID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The functional purpose of this prompt within the agent, such as "Initialize", "ProcessData", or "Summarize".' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'Purpose'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The sequence order in which this prompt should be executed within the agent''s workflow.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ExecutionOrder'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'If true, this prompt is required for the agent to function. If false, the agent can continue if this prompt fails.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'IsRequired'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional reference to a specific configuration to use for this prompt. If NULL, uses the default configuration.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The current status of this agent-prompt mapping. Values include Active, Inactive, Deprecated, and Preview.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'Status'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Determines how conversation context is filtered for this prompt: Complete, Smart, None, RecentMessages, InitialMessages, or Custom.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ContextBehavior'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The number of messages to include when ContextBehavior is set to RecentMessages or InitialMessages.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ContextMessageCount'

-- AIPrompt new columns for structured output
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The expected data type of the prompt output: string, number, boolean, date, or object.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'OutputType'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'JSON example output when OutputType is "object", used for validating structured outputs.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'OutputExample'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Determines how validation failures are handled: Strict (fail), Warn (log warning), or None (ignore).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ValidationBehavior'

-- AIConfiguration new columns for default prompts
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Default prompt to use for context compression when not specified at the agent level.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'DefaultPromptForContextCompressionID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Default prompt to use for context summarization when not specified at the agent level.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'DefaultPromptForContextSummarizationID'
