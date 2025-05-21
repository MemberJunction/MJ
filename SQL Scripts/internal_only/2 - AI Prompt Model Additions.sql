-- ---------------------------------------------------------------------------
-- MemberJunction AI Prompt Enhancement Schema
--  
-- This script creates new tables and enhances existing ones to support:
-- 1. Advanced model selection for prompts
-- 2. Configuration-based prompt execution
-- 3. Parallelization of prompt execution
-- 4. Model-specific parameters
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TRANSACTION 1: Table Creation and Column Addition
-- This transaction creates the basic table structures and adds columns
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;

    -- ---------------------------------------------------------------------------
    -- Create AIConfiguration table
    -- Stores configurations for AI prompt execution environments and settings.
    -- ---------------------------------------------------------------------------
    CREATE TABLE [__mj].[AIConfiguration](
        [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),  -- Primary key
        [Name] [nvarchar](100) NOT NULL,                               -- The name of the configuration
        [Description] [nvarchar](max) NULL,                            -- Detailed description of the configuration
        [IsDefault] [bit] NOT NULL DEFAULT (0),                        -- Indicates whether this is the default configuration to use when none is specified
        [Status] [nvarchar](20) NOT NULL DEFAULT (N'Active'),          -- The current status of the configuration (Active, Inactive, Deprecated, Preview)
        CONSTRAINT [PK_AIConfiguration_ID] PRIMARY KEY ([ID])
    );
    
    -- Add unique constraint on Name
    ALTER TABLE [__mj].[AIConfiguration] ADD CONSTRAINT [UQ_AIConfiguration_Name] 
        UNIQUE ([Name]);

    -- ---------------------------------------------------------------------------
    -- Create AIConfigurationParam table
    -- Stores configuration parameters that can be referenced by prompts and used to control execution behavior.
    -- ---------------------------------------------------------------------------
    CREATE TABLE [__mj].[AIConfigurationParam](
        [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),  -- Primary key
        [ConfigurationID] [uniqueidentifier] NOT NULL,                 -- References the configuration this parameter belongs to
        [Name] [nvarchar](100) NOT NULL,                               -- The name of the configuration parameter
        [Type] [nvarchar](20) NOT NULL DEFAULT (N'string'),            -- The data type of the parameter (string, number, boolean, date, object)
        [Value] [nvarchar](max) NOT NULL,                              -- The value of the parameter, interpreted according to the Type
        [Description] [nvarchar](max) NULL,                            -- Detailed description of the parameter and its usage
        CONSTRAINT [PK_AIConfigurationParam_ID] PRIMARY KEY ([ID])
    );
    
    -- Add unique constraint on ConfigurationID and Name
    ALTER TABLE [__mj].[AIConfigurationParam] ADD CONSTRAINT [UQ_AIConfigurationParam_Config_Name] 
        UNIQUE ([ConfigurationID], [Name]);

    -- ---------------------------------------------------------------------------
    -- Enhance AIPrompt table with new columns for model selection and parallelization
    -- Add columns with defaults inline to avoid constraint validation issues
    -- ---------------------------------------------------------------------------
    ALTER TABLE [__mj].[AIPrompt] ADD
        [AIModelTypeID] [uniqueidentifier] NULL,                         -- References the type of AI model this prompt is designed for
        [MinPowerRank] [int] NULL DEFAULT (0),                           -- The minimum power rank required for models to be considered
        [SelectionStrategy] [nvarchar](20) NOT NULL DEFAULT (N'Default'),-- How models are selected (Default, Specific, ByPower)
        [PowerPreference] [nvarchar](20) NOT NULL DEFAULT (N'Highest'),  -- When using ByPower, whether to prefer highest, lowest, or balanced power
        [ParallelizationMode] [nvarchar](20) NOT NULL DEFAULT (N'None'), -- If/how the prompt runs in parallel (None, StaticCount, ConfigParam)
        [ParallelCount] [int] NULL,                                      -- For StaticCount mode, the number of parallel executions
        [ParallelConfigParam] [nvarchar](100) NULL;                      -- For ConfigParam mode, the config parameter containing parallel count

    -- ---------------------------------------------------------------------------
    -- Create AIPromptModel table
    -- Associates AI prompts with specific models and configurations, including execution details.
    -- ---------------------------------------------------------------------------
    CREATE TABLE [__mj].[AIPromptModel](
        [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),  -- Primary key
        [PromptID] [uniqueidentifier] NOT NULL,                        -- References the AI prompt this model association applies to
        [ModelID] [uniqueidentifier] NOT NULL,                         -- References the AI model to use for this prompt
        [VendorID] [uniqueidentifier] NULL,                            -- Optional specific vendor (NULL uses highest priority vendor)
        [ConfigurationID] [uniqueidentifier] NULL,                     -- Optional specific configuration (NULL means all configurations)
        [Priority] [int] NOT NULL DEFAULT (0),                         -- Priority of this model (higher values = higher priority)
        [ExecutionGroup] [int] NOT NULL DEFAULT (0),                   -- Group for parallel processing (same group = parallel execution)
        [ModelParameters] [nvarchar](max) NULL,                        -- JSON-formatted model-specific parameters (temperature, etc.)
        [Status] [nvarchar](20) NOT NULL DEFAULT (N'Active'),          -- Status of this model configuration (Active, Inactive, etc.)
        CONSTRAINT [PK_AIPromptModel_ID] PRIMARY KEY ([ID])
    );

    -- Create a unique constraint to prevent duplicate model configurations
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [UQ_AIPromptModel_Prompt_Model_Vendor_Config] 
        UNIQUE ([PromptID], [ModelID], [VendorID], [ConfigurationID]);
    
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
-- TRANSACTION 2: Constraints, Relationships, and Default Data
-- This transaction adds constraints, foreign keys, and inserts default data
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;
    
    -- ---------------------------------------------------------------------------
    -- Add check constraints to tables
    -- ---------------------------------------------------------------------------
    
    -- AIConfiguration constraints
    ALTER TABLE [__mj].[AIConfiguration] ADD CONSTRAINT [CK_AIConfiguration_Status] 
        CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'));
    
    -- AIConfigurationParam constraints
    ALTER TABLE [__mj].[AIConfigurationParam] ADD CONSTRAINT [CK_AIConfigurationParam_Type] 
        CHECK ([Type] IN (N'string', N'number', N'boolean', N'date', N'object'));
    
    -- Add foreign key to AIConfiguration
    ALTER TABLE [__mj].[AIConfigurationParam] WITH CHECK ADD CONSTRAINT [FK_AIConfigurationParam_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [__mj].[AIConfiguration] ([ID]);
    
    ALTER TABLE [__mj].[AIConfigurationParam] CHECK CONSTRAINT [FK_AIConfigurationParam_ConfigurationID];
    
    -- AIPrompt constraints
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_SelectionStrategy] 
        CHECK ([SelectionStrategy] IN (N'Default', N'Specific', N'ByPower'));
    
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_PowerPreference] 
        CHECK ([PowerPreference] IN (N'Highest', N'Lowest', N'Balanced'));
    
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelizationMode] 
        CHECK ([ParallelizationMode] IN (N'None', N'StaticCount', N'ConfigParam', N'ModelSpecific'));
    
    -- Add validation constraints
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelCount] 
        CHECK (([ParallelizationMode] <> 'StaticCount') OR ([ParallelCount] IS NOT NULL));
    
    ALTER TABLE [__mj].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelConfigParam] 
        CHECK (([ParallelizationMode] <> 'ConfigParam') OR ([ParallelConfigParam] IS NOT NULL));
    
    -- Add foreign key to AIModelType
    ALTER TABLE [__mj].[AIPrompt] WITH CHECK ADD CONSTRAINT [FK_AIPrompt_AIModelTypeID] 
        FOREIGN KEY([AIModelTypeID]) REFERENCES [__mj].[AIModelType] ([ID]);
    
    ALTER TABLE [__mj].[AIPrompt] CHECK CONSTRAINT [FK_AIPrompt_AIModelTypeID];
    
    -- AIPromptModel constraints
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_Status] 
        CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'));
    
    -- Add check constraints for Execution parameters
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_Priority] 
        CHECK ([Priority] >= 0);
    
    ALTER TABLE [__mj].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ExecutionGroup] 
        CHECK ([ExecutionGroup] >= 0);
    
    -- Add foreign keys
    ALTER TABLE [__mj].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_PromptID] 
        FOREIGN KEY([PromptID]) REFERENCES [__mj].[AIPrompt] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_PromptID];
    
    ALTER TABLE [__mj].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_ModelID] 
        FOREIGN KEY([ModelID]) REFERENCES [__mj].[AIModel] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_ModelID];
    
    ALTER TABLE [__mj].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_VendorID] 
        FOREIGN KEY([VendorID]) REFERENCES [__mj].[AIVendor] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_VendorID];
    
    ALTER TABLE [__mj].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [__mj].[AIConfiguration] ([ID]);
    
    ALTER TABLE [__mj].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_ConfigurationID];
    
    -- Insert a default configuration
    INSERT INTO [__mj].[AIConfiguration] ([Name], [Description], [IsDefault], [Status])
    VALUES ('Default', 'Default configuration for AI prompt execution', 1, 'Active');
    
    COMMIT TRANSACTION;
    PRINT 'Constraints, relationships, and default data committed successfully.';
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

-- AIConfiguration table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Stores configurations for AI prompt execution environments and settings.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The name of the configuration.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'Name'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Detailed description of the configuration.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'Description'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Indicates whether this is the default configuration to use when none is specified.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'IsDefault'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The current status of the configuration. Values include Active, Inactive, Deprecated, and Preview.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'Status'

-- AIConfigurationParam table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Stores configuration parameters that can be referenced by prompts and used to control execution behavior.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfigurationParam'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The name of the configuration parameter.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Name'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The data type of the parameter (string, number, boolean, date, object).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Type'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The value of the parameter, stored as a string but interpreted according to the Type.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Value'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Detailed description of the parameter and its usage.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Description'

-- AIPrompt new columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the type of AI model this prompt is designed for (LLM, Image, Audio, etc.).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'AIModelTypeID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The minimum power rank required for models to be considered for this prompt.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'MinPowerRank'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Determines how models are selected for this prompt (Default, Specific, ByPower).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'SelectionStrategy'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When using ByPower selection strategy, determines whether to prefer highest, lowest, or balanced power models.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'PowerPreference'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Controls parallelization: None (no parallelization), StaticCount (use AIPrompt.ParallelCount for total runs), ConfigParam (use config param specified in ParallelConfigParam for total runs), or ModelSpecific (check each AIPromptModel''s individual settings).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ParallelizationMode'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When ParallelizationMode is StaticCount, specifies the number of parallel executions.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ParallelCount'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When ParallelizationMode is ConfigParam, specifies the name of the configuration parameter that contains the parallel count.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ParallelConfigParam'

-- AIPromptModel table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Associates AI prompts with specific models and configurations, including execution details.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the AI prompt this model association applies to.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'PromptID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the AI model to use for this prompt.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ModelID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional reference to a specific vendor for the model. If NULL, uses the highest priority vendor for the model.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'VendorID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional reference to a specific configuration. If NULL, this model is available in all configurations.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Priority of this model for the prompt. Higher values indicate higher priority.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'Priority'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Execution group for parallel processing. Models with the same group are executed in parallel.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ExecutionGroup'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'JSON-formatted parameters specific to this model (temperature, max tokens, etc.).' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ModelParameters'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The current status of this model configuration. Values include Active, Inactive, Deprecated, and Preview.' , 
    @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'Status'
