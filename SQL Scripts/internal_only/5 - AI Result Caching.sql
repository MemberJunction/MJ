-- ---------------------------------------------------------------------------
-- MemberJunction AI Prompt Logging and Caching Schema
-- 
-- This script:
-- 1. Creates the AIPromptRun table for execution logging
-- 2. Enhances AIPrompt with caching controls
-- 3. Enhances AIResultCache with additional fields for better caching
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TRANSACTION 1: Create AIPromptRun Table
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;

    -- Create AIPromptRun table
    CREATE TABLE [__mj].[AIPromptRun](
        [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
        [PromptID] [uniqueidentifier] NOT NULL,
        [ModelID] [uniqueidentifier] NOT NULL,
        [VendorID] [uniqueidentifier] NOT NULL,
        [AgentID] [uniqueidentifier] NULL,
        [ConfigurationID] [uniqueidentifier] NULL,
        [RunAt] [datetime2](7) NOT NULL DEFAULT (GETUTCDATE()),
        [CompletedAt] [datetime2](7) NULL,
        [ExecutionTimeMS] [int] NULL,
        [Messages] [nvarchar](max) NULL,
        [Result] [nvarchar](max) NULL,
        [TokensUsed] [int] NULL,
        [TokensPrompt] [int] NULL,
        [TokensCompletion] [int] NULL,
        [TotalCost] [decimal](18, 6) NULL,
        [Success] [bit] NOT NULL DEFAULT (0),
        [ErrorMessage] [nvarchar](max) NULL,
        CONSTRAINT [PK_AIPromptRun_ID] PRIMARY KEY ([ID])
    );

    ALTER TABLE [__mj].[AIPrompt] DROP CONSTRAINT [DF__AIPrompt__CacheR__3C94E422]
    ALTER TABLE [__mj].[AIPrompt] DROP CONSTRAINT [DF__AIPrompt__CacheE__3D89085B]

    -- Drop existing cache columns that will be replaced
    ALTER TABLE [__mj].[AIPrompt] DROP COLUMN 
        [CacheResults],  -- Will be replaced by EnableCaching
        [CacheExpiration]; -- Will be replaced by CacheTTLSeconds
    
    -- Add caching control fields to AIPrompt
    ALTER TABLE [__mj].[AIPrompt] ADD
        [EnableCaching] [bit] NOT NULL DEFAULT(0),                -- Whether to cache results
        [CacheTTLSeconds] [int] NULL,                             -- Time-to-live in seconds (NULL = never expire)
        [CacheMatchType] [nvarchar](20) NOT NULL DEFAULT('Exact'), -- Exact, Vector
        [CacheSimilarityThreshold] [float] NULL,                  -- Value between 0-1, only used with Vector match
        -- Cache matching criteria
        [CacheMustMatchModel] [bit] NOT NULL DEFAULT(1),          -- Whether ModelID must match for cache hit
        [CacheMustMatchVendor] [bit] NOT NULL DEFAULT(1),         -- Whether VendorID must match for cache hit
        [CacheMustMatchAgent] [bit] NOT NULL DEFAULT(0),          -- Whether AgentID must match for cache hit
        [CacheMustMatchConfig] [bit] NOT NULL DEFAULT(0);         -- Whether ConfigurationID must match for cache hit

    -- Add new fields to AIResultCache
    ALTER TABLE [__mj].[AIResultCache] ADD
        [VendorID] [uniqueidentifier] NULL,             -- The vendor that provided this result
        [AgentID] [uniqueidentifier] NULL,              -- The agent that initiated the request (if any)
        [ConfigurationID] [uniqueidentifier] NULL,      -- The configuration used for this execution
        [PromptEmbedding] [varbinary](max) NULL,        -- Vector representation of the prompt
        [PromptRunID] [uniqueidentifier] NULL;          -- Reference to the AIPromptRun that created this cache entry
        
    COMMIT TRANSACTION;
    PRINT 'Tables created/modified successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error creating or modifying tables: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO -- Separate transaction batches

-- ---------------------------------------------------------------------------
-- TRANSACTION 2: Enhance AIPrompt with Caching Controls
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;
    
    -- Add check constraint on CacheMatchType
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_CacheMatchType]
        CHECK ([CacheMatchType] IN (N'Exact', N'Vector'));
    
    -- Add check constraint on CacheSimilarityThreshold
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_CacheSimilarityThreshold]
        CHECK ([CacheSimilarityThreshold] IS NULL OR 
               ([CacheSimilarityThreshold] >= 0 AND [CacheSimilarityThreshold] <= 1));
    
    -- Add check constraint to ensure threshold is provided when using Vector matching
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_VectorMatchThreshold]
        CHECK ([CacheMatchType] <> 'Vector' OR [CacheSimilarityThreshold] IS NOT NULL);
    
    -- Add check constraint to ensure TTL is positive when specified
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_CacheTTLSeconds]
        CHECK ([CacheTTLSeconds] IS NULL OR [CacheTTLSeconds] > 0);
        
    COMMIT TRANSACTION;
    PRINT 'AIPrompt caching enhancements committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error enhancing AIPrompt with caching controls: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO -- Separate transaction batches

-- ---------------------------------------------------------------------------
-- TRANSACTION 3: Enhance AIResultCache with Additional Fields
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;

    -- Add foreign keys
    ALTER TABLE [__mj].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_VendorID] 
        FOREIGN KEY([VendorID]) REFERENCES [__mj].[AIVendor] ([ID]);
    
    ALTER TABLE [__mj].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_VendorID];
    
    ALTER TABLE [__mj].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_AgentID] 
        FOREIGN KEY([AgentID]) REFERENCES [__mj].[AIAgent] ([ID]);
    
    ALTER TABLE [__mj].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_AgentID];
    
    ALTER TABLE [__mj].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [__mj].[AIConfiguration] ([ID]);
    
    ALTER TABLE [__mj].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_ConfigurationID];
    
    ALTER TABLE [__mj].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_PromptRunID] 
        FOREIGN KEY([PromptRunID]) REFERENCES [__mj].[AIPromptRun] ([ID]);
    
    ALTER TABLE [__mj].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_PromptRunID];
    
    -- Add index for efficient cache lookups
    CREATE INDEX [IX_AIResultCache_Lookup] ON [__mj].[AIResultCache]
        ([AIPromptID], [AIModelID], [VendorID], [Status])
        INCLUDE ([ResultText])
        WHERE [Status] = 'Active';
        
    COMMIT TRANSACTION;
    PRINT 'AIResultCache enhancements committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error enhancing AIResultCache: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO -- Separate transaction batches

-- ---------------------------------------------------------------------------
-- TRANSACTION 4: Constraints and Foreign Keys for AIPromptRun
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;

    -- Add foreign key to AIPrompt
    ALTER TABLE [__mj].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_PromptID] 
        FOREIGN KEY([PromptID]) REFERENCES [__mj].[AIPrompt] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_PromptID];
    
    -- Add foreign key to AIModel
    ALTER TABLE [__mj].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_ModelID] 
        FOREIGN KEY([ModelID]) REFERENCES [__mj].[AIModel] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_ModelID];
    
    -- Add foreign key to AIVendor
    ALTER TABLE [__mj].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_VendorID] 
        FOREIGN KEY([VendorID]) REFERENCES [__mj].[AIVendor] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_VendorID];
    
    -- Add foreign key to AIConfiguration
    ALTER TABLE [__mj].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [__mj].[AIConfiguration] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_ConfigurationID];
    
    -- Add foreign key to AIAgent
    ALTER TABLE [__mj].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_AgentID] 
        FOREIGN KEY([AgentID]) REFERENCES [__mj].[AIAgent] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_AgentID];
    
    -- Add check constraint for timing fields
    ALTER TABLE [__mj].[AIPromptRun] ADD CONSTRAINT [CK_AIPromptRun_Timing]
        CHECK ([CompletedAt] IS NULL OR [CompletedAt] >= [RunAt]);
    
    -- Add check constraint for token counts
    ALTER TABLE [__mj].[AIPromptRun] ADD CONSTRAINT [CK_AIPromptRun_Tokens]
        CHECK (
            ([TokensPrompt] IS NULL AND [TokensCompletion] IS NULL) OR
            ([TokensUsed] IS NULL) OR
            ([TokensUsed] = [TokensPrompt] + [TokensCompletion])
        );
    
    -- Add index for common queries
    CREATE INDEX [IX_AIPromptRun_PromptID_RunAt] ON [__mj].[AIPromptRun]([PromptID], [RunAt] DESC);
    CREATE INDEX [IX_AIPromptRun_AgentID_RunAt] ON [__mj].[AIPromptRun]([AgentID], [RunAt] DESC) WHERE [AgentID] IS NOT NULL;
    
    COMMIT TRANSACTION;
    PRINT 'AIPromptRun constraints and foreign keys added successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error adding AIPromptRun constraints: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO

-- ---------------------------------------------------------------------------
-- Extended properties for documentation
-- ---------------------------------------------------------------------------

-- Table description for AIPromptRun
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Tracks AI prompt executions including timings, inputs, outputs, and performance metrics.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun';

-- Column descriptions for AIPromptRun
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The prompt that was executed.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'PromptID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The AI model used for execution.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ModelID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The vendor providing the model/inference.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'VendorID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'If this prompt was run as part of an agent, references the agent.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'AgentID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional configuration used for this execution.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When the prompt execution started.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'RunAt';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When the prompt execution finished. NULL indicates a pending or interrupted execution.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'CompletedAt';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Total execution time in milliseconds.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ExecutionTimeMS';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The input messages sent to the model, typically in JSON format.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'Messages';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The output result from the model.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'Result';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Total number of tokens used (prompt + completion).', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TokensUsed';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of tokens in the prompt.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TokensPrompt';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of tokens in the completion/result.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TokensCompletion';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Estimated cost of this execution in USD.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TotalCost';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Whether the execution was successful.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'Success';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Error message if the execution failed.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ErrorMessage';

-- Constraint descriptions for AIPromptRun
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Ensures that CompletedAt is after RunAt when present.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'CONSTRAINT',@level2name=N'CK_AIPromptRun_Timing';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Ensures token counts are consistent when present.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'CONSTRAINT',@level2name=N'CK_AIPromptRun_Tokens';

-- Column descriptions for AIPrompt caching fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, results from this prompt will be cached for potential reuse.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'EnableCaching';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Time-to-live in seconds for cached results. NULL means results never expire.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheTTLSeconds';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Method for matching cached results: Exact (string matching) or Vector (embedding similarity).', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMatchType';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Threshold (0-1) for vector similarity matching. Higher values require closer matches.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheSimilarityThreshold';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the AI model must match for a cache hit. When false, results from any model can be used.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchModel';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the vendor must match for a cache hit. When false, results from any vendor can be used.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchVendor';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the agent context must match for a cache hit. When false, agent-specific and non-agent results can be used interchangeably.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchAgent';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the configuration must match for a cache hit. When false, results from any configuration can be used.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchConfig';

-- Column descriptions for AIResultCache new fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The vendor that provided this result.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'VendorID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The agent that initiated the request, if any.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'AgentID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The configuration used for this execution.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Vector representation of the prompt for similarity matching.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'PromptEmbedding';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Reference to the AIPromptRun that created this cache entry.', 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'PromptRunID';
