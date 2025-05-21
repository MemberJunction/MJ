-- ---------------------------------------------------------------------------
-- MemberJunction AI Prompt Enhancement Schema - Retries, Parallelization, and Result Selection
-- 
-- This script enhances the AIPrompt and AIPromptModel tables to support:
-- 1. Retry settings for API failures
-- 2. Model-specific parallelization counts
-- 3. Best result selector prompt integration
-- ---------------------------------------------------------------------------

BEGIN TRY
    BEGIN TRANSACTION;
     
    -- ---------------------------------------------------------------------------
    -- 1. Add retry capabilities to AIPrompt
    -- ---------------------------------------------------------------------------
    ALTER TABLE [__mj].[AIPrompt] ADD
        [MaxRetries] [int] NOT NULL DEFAULT(0),                   -- Maximum number of retry attempts
        [RetryDelayMS] [int] NOT NULL DEFAULT(0),                 -- Delay between retries in milliseconds
        [RetryStrategy] [nvarchar](20) NOT NULL DEFAULT('Fixed'), -- Fixed, Exponential, Linear
        [ResultSelectorPromptID] [uniqueidentifier] NULL;         -- Reference to a prompt that selects the best result

    -- Then add model-specific parallelization to AIPromptModel
    ALTER TABLE [__mj].[AIPromptModel] ADD
        [ParallelizationMode] [nvarchar](20) NOT NULL DEFAULT('None'), -- None, StaticCount, ConfigParam 
        [ParallelCount] [int] NOT NULL DEFAULT(1),                     -- Number of parallel executions for this model
        [ParallelConfigParam] [nvarchar](100) NULL;                    -- Config parameter containing parallel count

    COMMIT TRANSACTION;

    PRINT 'Table enhancements committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error in AIPrompt enhancements: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO



BEGIN TRY
    BEGIN TRANSACTION;

    -- Add check constraint on RetryStrategy
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_RetryStrategy]
        CHECK ([RetryStrategy] IN (N'Fixed', N'Exponential', N'Linear'));

    -- ---------------------------------------------------------------------------
    -- 2. Update parallelization approach
    -- ---------------------------------------------------------------------------
    
    -- First, update AIPrompt.ParallelizationMode to include ModelSpecific option
    -- This requires dropping the constraint, updating it, and re-adding it
    ALTER TABLE [__mj].[AIPrompt] DROP CONSTRAINT [CK_AIPrompt_ParallelizationMode];
    
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelizationMode]
        CHECK ([ParallelizationMode] IN (N'None', N'StaticCount', N'ConfigParam', N'ModelSpecific'));
    

    -- Add check constraint on ParallelizationMode
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ParallelizationMode]
        CHECK ([ParallelizationMode] IN (N'None', N'StaticCount', N'ConfigParam'));
    
    -- Add constraint to ensure ParallelCount is at least 1
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ParallelCount]
        CHECK ([ParallelCount] >= 1);
    
    -- Add constraint to ensure parallelization mode and parameters match
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ParallelModeParams]
        CHECK (
            ([ParallelizationMode] = 'None') OR
            ([ParallelizationMode] = 'StaticCount' AND [ParallelConfigParam] IS NULL) OR
            ([ParallelizationMode] = 'ConfigParam' AND [ParallelConfigParam] IS NOT NULL)
        );

    -- Add foreign key to AIPrompt
    ALTER TABLE [__mj].[AIPrompt] WITH CHECK ADD CONSTRAINT [FK_AIPrompt_ResultSelectorPromptID] 
        FOREIGN KEY([ResultSelectorPromptID]) REFERENCES [__mj].[AIPrompt] ([ID]);
    
    ALTER TABLE [__mj].[AIPrompt] CHECK CONSTRAINT [FK_AIPrompt_ResultSelectorPromptID];
    
    -- Add check constraint to prevent a prompt from being its own selector
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ResultSelectorPromptID]
        CHECK ([ResultSelectorPromptID] <> [ID]);
        
    COMMIT TRANSACTION;

    PRINT 'Constraints committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error in AIPrompt enhancements: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO


-- ---------------------------------------------------------------------------
-- Extended properties for documentation
-- ---------------------------------------------------------------------------

-- AIPrompt retry fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Maximum number of retry attempts for API failures.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'MaxRetries'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Delay between retry attempts in milliseconds.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'RetryDelayMS'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Strategy for calculating retry delays: Fixed (same delay each time), Exponential (doubling delay), or Linear (linearly increasing delay).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'RetryStrategy'


-- AIPromptModel parallelization fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Controls how this model participates in parallelization: None, StaticCount, or ConfigParam.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ParallelizationMode'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of parallel executions to perform with this model when ParallelizationMode is StaticCount.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ParallelCount'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Name of a configuration parameter that contains the parallel count when ParallelizationMode is ConfigParam.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ParallelConfigParam'

-- AIPrompt selector fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References another prompt that selects the best result from multiple parallel executions.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ResultSelectorPromptID'
