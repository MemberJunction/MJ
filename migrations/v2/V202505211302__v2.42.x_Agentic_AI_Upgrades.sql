/************************************************************************************************
 ************************************************************************************************ 
        PART 1 - AI Vendors Migration
 ************************************************************************************************ 
 ***********************************************************************************************/


-- ---------------------------------------------------------------------------
-- MemberJunction AI Schema Migration
-- 
-- This script creates new tables for the enhanced AI architecture:
-- 1. AIVendor - Stores information about AI vendors
-- 2. AIVendorTypeDefinition - Defines vendor types (Model Developer, Inference Provider)
-- 3. AIVendorType - Links vendors to their types with priority rankings
-- 4. AIModelVendor - Links models to vendors with implementation details
-- 5. vwAIModels_Custom - View for backward compatibility
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
 
-- ---------------------------------------------------------------------------
-- Migration script to populate new tables from existing AIModel table
-- ---------------------------------------------------------------------------
BEGIN TRY
    BEGIN TRANSACTION;

	-- ---------------------------------------------------------------------------
	-- Create AIVendor table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [${flyway:defaultSchema}].[AIVendor](
		[ID] [uniqueidentifier] NOT NULL,
		[Name] [nvarchar](50) NOT NULL,
		[Description] [nvarchar](max) NULL,
	 CONSTRAINT [PK_AIVendor_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	ALTER TABLE [${flyway:defaultSchema}].[AIVendor] ADD CONSTRAINT [DF__AIVendor__ID]  DEFAULT (newsequentialid()) FOR [ID]

	-- Add a unique constraint on Name
	ALTER TABLE [${flyway:defaultSchema}].[AIVendor] ADD CONSTRAINT [UQ_AIVendor_Name] UNIQUE ([Name])

	-- ---------------------------------------------------------------------------
	-- Create AIVendorTypeDefinition table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [${flyway:defaultSchema}].[AIVendorTypeDefinition](
		[ID] [uniqueidentifier] NOT NULL,
		[Name] [nvarchar](50) NOT NULL,
		[Description] [nvarchar](max) NULL,
	 CONSTRAINT [PK_AIVendorTypeDefinition_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	-- No default for ID as we'll insert specific UUIDs

	-- Add a unique constraint on Name
	ALTER TABLE [${flyway:defaultSchema}].[AIVendorTypeDefinition] ADD CONSTRAINT [UQ_AIVendorTypeDefinition_Name] UNIQUE ([Name])

	-- ---------------------------------------------------------------------------
	-- Create AIVendorType table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [${flyway:defaultSchema}].[AIVendorType](
		[ID] [uniqueidentifier] NOT NULL,
		[VendorID] [uniqueidentifier] NOT NULL,
		[TypeID] [uniqueidentifier] NOT NULL,
		[Rank] [int] NOT NULL,
		[Status] [nvarchar](20) NOT NULL,
	 CONSTRAINT [PK_AIVendorType_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD CONSTRAINT [DF__AIVendorType__ID]  DEFAULT (newsequentialid()) FOR [ID]

	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD CONSTRAINT [DF__AIVendorType__Rank]  DEFAULT ((0)) FOR [Rank]

	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD CONSTRAINT [DF__AIVendorType__Status]  DEFAULT (N'Active') FOR [Status]

	-- Add foreign key constraints
	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] WITH CHECK ADD CONSTRAINT [FK_AIVendorType_AIVendor] FOREIGN KEY([VendorID])
	REFERENCES [${flyway:defaultSchema}].[AIVendor] ([ID])

	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] CHECK CONSTRAINT [FK_AIVendorType_AIVendor]

	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] WITH CHECK ADD CONSTRAINT [FK_AIVendorType_AIVendorTypeDefinition] FOREIGN KEY([TypeID])
	REFERENCES [${flyway:defaultSchema}].[AIVendorTypeDefinition] ([ID])

	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] CHECK CONSTRAINT [FK_AIVendorType_AIVendorTypeDefinition]

	-- Add check constraint on Status
	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD CONSTRAINT [CK_AIVendorType_Status] CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'))

	-- Add check constraint on Rank
	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD CONSTRAINT [CK_AIVendorType_Rank] CHECK ([Rank] >= 0)

	-- Add unique constraint to prevent duplicate vendor-type combinations
	ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD CONSTRAINT [UQ_AIVendorType_VendorID_TypeID] UNIQUE ([VendorID], [TypeID])

	-- ---------------------------------------------------------------------------
	-- Create AIModelVendor table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [${flyway:defaultSchema}].[AIModelVendor](
		[ID] [uniqueidentifier] NOT NULL,
		[ModelID] [uniqueidentifier] NOT NULL,
		[VendorID] [uniqueidentifier] NOT NULL,
		[Priority] [int] NOT NULL,
		[Status] [nvarchar](20) NOT NULL,
		[DriverClass] [nvarchar](100) NULL,
		[DriverImportPath] [nvarchar](255) NULL,
		[APIName] [nvarchar](100) NULL,
		[MaxInputTokens] [int] NULL,
		[MaxOutputTokens] [int] NULL,
		[SupportedResponseFormats] [nvarchar](100) NOT NULL,
		[SupportsEffortLevel] [bit] NOT NULL,
		[SupportsStreaming] [bit] NOT NULL,
	 CONSTRAINT [PK_AIModelVendor_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__ID]  DEFAULT (newsequentialid()) FOR [ID]

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__Priority]  DEFAULT ((0)) FOR [Priority]

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__Status]  DEFAULT (N'Active') FOR [Status]

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__SupportedResponseFormats]  DEFAULT (N'Any') FOR [SupportedResponseFormats]

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__SupportsEffortLevel]  DEFAULT ((0)) FOR [SupportsEffortLevel]

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__SupportsStreaming]  DEFAULT ((0)) FOR [SupportsStreaming]

	-- Add foreign key constraints
	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] WITH CHECK ADD CONSTRAINT [FK_AIModelVendor_AIModel] FOREIGN KEY([ModelID])
	REFERENCES [${flyway:defaultSchema}].[AIModel] ([ID])

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] CHECK CONSTRAINT [FK_AIModelVendor_AIModel]
	
	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] WITH CHECK ADD CONSTRAINT [FK_AIModelVendor_AIVendor] FOREIGN KEY([VendorID])
	REFERENCES [${flyway:defaultSchema}].[AIVendor] ([ID])

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] CHECK CONSTRAINT [FK_AIModelVendor_AIVendor]

	-- Add check constraint on Status
	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_Status] CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'))

	-- Add check constraint on Priority
	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_Priority] CHECK ([Priority] >= 0)

	-- Add check constraints on token limits
	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_MaxInputTokens] CHECK ([MaxInputTokens] IS NULL OR [MaxInputTokens] >= 0)

	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_MaxOutputTokens] CHECK ([MaxOutputTokens] IS NULL OR [MaxOutputTokens] >= 0)

	-- Add unique constraint to prevent duplicate model-vendor combinations
	ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD CONSTRAINT [UQ_AIModelVendor_ModelID_VendorID] UNIQUE ([ModelID], [VendorID])

	-- ---------------------------------------------------------------------------
	-- VERSION INFORMATION - UPDATE THIS WHEN RELEASING
	-- ---------------------------------------------------------------------------
	DECLARE @MJ_VERSION varchar(20) = '2.42.0';

	-- ---------------------------------------------------------------------------
	-- Add new AuditLogType for migration tracking
	-- ---------------------------------------------------------------------------
	INSERT INTO [${flyway:defaultSchema}].[AuditLogType] ([ID], [Name], [Description], [ParentID], [AuthorizationID])
	VALUES ('A842FE1D-C7BF-4724-9D6D-37D225D4E36B', 'Migration Log', 'Notes from MJ Migrations', NULL, NULL)

    -- Declare variables for logging
    DECLARE @MigrationLogTypeID uniqueidentifier = 'A842FE1D-C7BF-4724-9D6D-37D225D4E36B';
    DECLARE @SystemUserID uniqueidentifier = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Hardcoded system user ID
    
    -- Insert migration start log
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | AI Architecture Migration Started', 
     'Starting migration to new AI vendor and model architecture');

    -- Insert predefined AIVendorTypeDefinition records with fixed IDs
    INSERT INTO [${flyway:defaultSchema}].[AIVendorTypeDefinition] ([ID], [Name], [Description])
    VALUES 
    ('10DB468E-F2CE-475D-9F39-2DF2DE75D257', 'Model Developer', 'Companies that develop and train AI models'),
    ('5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', 'Inference Provider', 'Companies that provide inference services for AI models');

    -- Log vendor type definitions created
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Vendor type definitions created');

    -- Extract unique vendors from AIModel and use the oldest row's ID for each vendor
    WITH VendorIDs AS (
        SELECT 
            [Vendor] AS VendorName,
            (SELECT TOP 1 [ID] FROM [${flyway:defaultSchema}].[AIModel] m2 
             WHERE m2.[Vendor] = m1.[Vendor] 
             ORDER BY m2.[__mj_CreatedAt]) AS OldestID
        FROM 
            [${flyway:defaultSchema}].[AIModel] m1
        WHERE 
            [Vendor] IS NOT NULL
        GROUP BY 
            [Vendor]
    )
    INSERT INTO [${flyway:defaultSchema}].[AIVendor] ([ID], [Name], [Description])
    SELECT 
        v.OldestID,
        v.VendorName,
        'AI Vendor'
    FROM 
        VendorIDs v;

    -- Log vendors migrated
    DECLARE @VendorCount int;
    SELECT @VendorCount = COUNT(*) FROM [${flyway:defaultSchema}].[AIVendor];
    
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Vendors migrated', 
     'Migrated ' + CAST(@VendorCount AS varchar) + ' unique vendors to AIVendor table.');

    -- Get the predefined type IDs
    DECLARE @ModelDeveloperTypeID uniqueidentifier = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
    DECLARE @InferenceProviderTypeID uniqueidentifier = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

    -- Insert vendor types for all vendors
    INSERT INTO [${flyway:defaultSchema}].[AIVendorType] ([VendorID], [TypeID], [Rank], [Status])
    SELECT 
        v.[ID],
        @ModelDeveloperTypeID,
        10, -- Higher priority for Model Developer
        'Active'
    FROM 
        [${flyway:defaultSchema}].[AIVendor] v;

    -- Log Model Developer types set
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Set Model Developer type for all vendors');

    INSERT INTO [${flyway:defaultSchema}].[AIVendorType] ([VendorID], [TypeID], [Rank], [Status])
    SELECT 
        v.[ID],
        @InferenceProviderTypeID,
        5, -- Lower priority for Inference Provider
        'Active'
    FROM 
        [${flyway:defaultSchema}].[AIVendor] v;

    -- Log Inference Provider types set
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Set Inference Provider type for all vendors');

    -- Create entries in AIModelVendor
    INSERT INTO [${flyway:defaultSchema}].[AIModelVendor] (
        [ModelID],
        [VendorID],
        [Priority],
        [Status],
        [DriverClass],
        [DriverImportPath],
        [APIName],
        [MaxInputTokens],
        [SupportedResponseFormats],
        [SupportsEffortLevel]
    )
    SELECT 
        m.[ID],
        v.[ID],
        ISNULL(m.[PowerRank], 0), -- Use PowerRank as initial Priority
        CASE WHEN m.[IsActive] = 1 THEN 'Active' ELSE 'Inactive' END,
        m.[DriverClass],
        m.[DriverImportPath],
        m.[APIName],
        m.[InputTokenLimit],
        m.[SupportedResponseFormats],
        m.[SupportsEffortLevel]
    FROM 
        [${flyway:defaultSchema}].[AIModel] m
    JOIN 
        [${flyway:defaultSchema}].[AIVendor] v ON m.[Vendor] = v.[Name]
    WHERE 
        m.[Vendor] IS NOT NULL;

    -- Log model-vendor relationships created
    DECLARE @ModelVendorCount int;
    SELECT @ModelVendorCount = COUNT(*) FROM [${flyway:defaultSchema}].[AIModelVendor];
    
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Model-vendor relationships created', 
     'Created ' + CAST(@ModelVendorCount AS varchar) + ' model-vendor relationships in AIModelVendor table.');

    -- Set SupportsStreaming based on a heuristic
    UPDATE [${flyway:defaultSchema}].[AIModelVendor]
    SET [SupportsStreaming] = 1
    WHERE 
        [ModelID] IN (
            SELECT [ID] FROM [${flyway:defaultSchema}].[AIModel] 
            WHERE [Name] LIKE '%GPT-4%' OR [Name] LIKE '%Claude%' OR [Name] LIKE '%Gemini%'
        );

    -- Log streaming support updated
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Updated streaming support for newer models');

    -- Log migration completion
    INSERT INTO [${flyway:defaultSchema}].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | AI Architecture Migration Completed', 
     'Successfully migrated to new AI vendor and model architecture');

	-- now, only if the above worked, get rid of the old columns and then create the new vwAIModels view
	-- ---------------------------------------------------------------------------
	-- Remove redundant columns from AIModel (now stored in AIModelVendor)
	-- ---------------------------------------------------------------------------
	ALTER TABLE ${flyway:defaultSchema}.AIModel
		DROP CONSTRAINT 
			[DF__AIModel__Support__61274A53],
			[DF__AIModel__Support__7C655074];

	ALTER TABLE [${flyway:defaultSchema}].[AIModel] 
		DROP COLUMN 
			Vendor,
			[DriverClass], 
			[DriverImportPath], 
			[APIName], 
			[InputTokenLimit], 
			[SupportsEffortLevel],
			[SupportedResponseFormats];  

    -- Commit the transaction if everything succeeded
    COMMIT TRANSACTION;
END TRY 
BEGIN CATCH
    -- Roll back the transaction if an error occurred
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

  	PRINT 'FAILED';
     
    THROW;
END CATCH

-- ---------------------------------------------------------------------------
-- Create view for backward compatibility bringing in top priotiy for AIModelVendor - now using TOP 1 to handle ties
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwAIModels_Custom;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIModels_Custom]
AS
SELECT 
	m.*,
	AIModelType_AIModelTypeID.[Name] AS [AIModelType],
	v.[Name] AS [Vendor],
	mv.[DriverClass],
	mv.[DriverImportPath],
	mv.[APIName],
	mv.[MaxInputTokens] AS [InputTokenLimit],
	mv.[SupportedResponseFormats],
	mv.[SupportsEffortLevel]
FROM 
	[${flyway:defaultSchema}].[AIModel] m
INNER JOIN
	[${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
	ON
	[m].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
OUTER APPLY (
	SELECT TOP 1
		mv.[ModelID],
		mv.[DriverClass],
		mv.[DriverImportPath],
		mv.[APIName],
		mv.[MaxInputTokens],
		mv.[SupportedResponseFormats],
		mv.[SupportsEffortLevel],
		mv.[VendorID]
	FROM 
		[${flyway:defaultSchema}].[AIModelVendor] mv
	WHERE
		mv.[ModelID] = m.[ID]
		AND mv.[Status] = 'Active'
	ORDER BY 
		mv.[Priority] DESC
) mv
LEFT JOIN [${flyway:defaultSchema}].[AIVendor] v ON mv.[VendorID] = v.[ID]
GO


-- ---------------------------------------------------------------------------
-- Extended properties for documentation
-- ---------------------------------------------------------------------------

-- AIVendor table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Stores information about AI vendors providing models and/or inference services.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendor'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The unique name of the vendor.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendor', @level2type=N'COLUMN',@level2name=N'Name'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description of the vendor and their AI offerings.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendor', @level2type=N'COLUMN',@level2name=N'Description'
GO

-- AIVendorTypeDefinition table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Defines the possible types of AI vendors, such as Model Developer or Inference Provider.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendorTypeDefinition'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The name of the vendor type.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendorTypeDefinition', @level2type=N'COLUMN',@level2name=N'Name'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description of the vendor type.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendorTypeDefinition', @level2type=N'COLUMN',@level2name=N'Description'
GO

-- AIVendorType table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Associates vendors with their types (Model Developer, Inference Provider) and tracks the status of each role.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendorType'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Determines the priority rank of this type for the vendor. Higher values indicate higher priority.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendorType', @level2type=N'COLUMN',@level2name=N'Rank'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The current status of this vendor type. Values include Active, Inactive, Deprecated, and Preview.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIVendorType', @level2type=N'COLUMN',@level2name=N'Status'
GO

-- AIModelVendor table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Associates AI models with vendors providing them, including vendor-specific implementation details.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Determines the priority rank of this vendor for the model. Higher values indicate higher priority.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'Priority'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The current status of this model-vendor combination. Values include Active, Inactive, Deprecated, and Preview.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'Status'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The name of the driver class implementing this model-vendor combination.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'DriverClass'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The import path for the driver class.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'DriverImportPath'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The name of the model to use with API calls, which might differ from the model name. If not provided, the model name will be used.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'APIName'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The maximum number of input tokens supported by this model-vendor implementation.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'MaxInputTokens'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The maximum number of output tokens supported by this model-vendor implementation.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'MaxOutputTokens'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'A comma-delimited string indicating the supported response formats for this model-vendor implementation. Options include Any, Text, Markdown, JSON, and ModelSpecific.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'SupportedResponseFormats'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Specifies if this model-vendor implementation supports the concept of an effort level.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'SupportsEffortLevel'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Specifies if this model-vendor implementation supports streaming responses.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'SupportsStreaming'
GO

-- vwAIModels view
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Backward compatibility view that simulates the original AIModel table structure by selecting the highest priority vendor for each model.' , @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'VIEW',@level1name=N'vwAIModels'
GO


/************************************************************************************************
 ************************************************************************************************ 
        PART 2 - AI Prompt Enhancement Schema
 ************************************************************************************************ 
 ***********************************************************************************************/


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
    CREATE TABLE [${flyway:defaultSchema}].[AIConfiguration](
        [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),  -- Primary key
        [Name] [nvarchar](100) NOT NULL,                               -- The name of the configuration
        [Description] [nvarchar](max) NULL,                            -- Detailed description of the configuration
        [IsDefault] [bit] NOT NULL DEFAULT (0),                        -- Indicates whether this is the default configuration to use when none is specified
        [Status] [nvarchar](20) NOT NULL DEFAULT (N'Active'),          -- The current status of the configuration (Active, Inactive, Deprecated, Preview)
        CONSTRAINT [PK_AIConfiguration_ID] PRIMARY KEY ([ID])
    );
    
    -- Add unique constraint on Name
    ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] ADD CONSTRAINT [UQ_AIConfiguration_Name] 
        UNIQUE ([Name]);

    -- ---------------------------------------------------------------------------
    -- Create AIConfigurationParam table
    -- Stores configuration parameters that can be referenced by prompts and used to control execution behavior.
    -- ---------------------------------------------------------------------------
    CREATE TABLE [${flyway:defaultSchema}].[AIConfigurationParam](
        [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),  -- Primary key
        [ConfigurationID] [uniqueidentifier] NOT NULL,                 -- References the configuration this parameter belongs to
        [Name] [nvarchar](100) NOT NULL,                               -- The name of the configuration parameter
        [Type] [nvarchar](20) NOT NULL DEFAULT (N'string'),            -- The data type of the parameter (string, number, boolean, date, object)
        [Value] [nvarchar](max) NOT NULL,                              -- The value of the parameter, interpreted according to the Type
        [Description] [nvarchar](max) NULL,                            -- Detailed description of the parameter and its usage
        CONSTRAINT [PK_AIConfigurationParam_ID] PRIMARY KEY ([ID])
    );
    
    -- Add unique constraint on ConfigurationID and Name
    ALTER TABLE [${flyway:defaultSchema}].[AIConfigurationParam] ADD CONSTRAINT [UQ_AIConfigurationParam_Config_Name] 
        UNIQUE ([ConfigurationID], [Name]);

    -- ---------------------------------------------------------------------------
    -- Enhance AIPrompt table with new columns for model selection and parallelization
    -- Add columns with defaults inline to avoid constraint validation issues
    -- ---------------------------------------------------------------------------
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD
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
    CREATE TABLE [${flyway:defaultSchema}].[AIPromptModel](
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
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [UQ_AIPromptModel_Prompt_Model_Vendor_Config] 
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
    ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] ADD CONSTRAINT [CK_AIConfiguration_Status] 
        CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'));
    
    -- AIConfigurationParam constraints
    ALTER TABLE [${flyway:defaultSchema}].[AIConfigurationParam] ADD CONSTRAINT [CK_AIConfigurationParam_Type] 
        CHECK ([Type] IN (N'string', N'number', N'boolean', N'date', N'object'));
    
    -- Add foreign key to AIConfiguration
    ALTER TABLE [${flyway:defaultSchema}].[AIConfigurationParam] WITH CHECK ADD CONSTRAINT [FK_AIConfigurationParam_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIConfigurationParam] CHECK CONSTRAINT [FK_AIConfigurationParam_ConfigurationID];
    
    -- AIPrompt constraints
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_SelectionStrategy] 
        CHECK ([SelectionStrategy] IN (N'Default', N'Specific', N'ByPower'));
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_PowerPreference] 
        CHECK ([PowerPreference] IN (N'Highest', N'Lowest', N'Balanced'));
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelizationMode] 
        CHECK ([ParallelizationMode] IN (N'None', N'StaticCount', N'ConfigParam', N'ModelSpecific'));
    
    -- Add validation constraints
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelCount] 
        CHECK (([ParallelizationMode] <> 'StaticCount') OR ([ParallelCount] IS NOT NULL));
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelConfigParam] 
        CHECK (([ParallelizationMode] <> 'ConfigParam') OR ([ParallelConfigParam] IS NOT NULL));
    
    -- Add foreign key to AIModelType
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] WITH CHECK ADD CONSTRAINT [FK_AIPrompt_AIModelTypeID] 
        FOREIGN KEY([AIModelTypeID]) REFERENCES [${flyway:defaultSchema}].[AIModelType] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] CHECK CONSTRAINT [FK_AIPrompt_AIModelTypeID];
    
    -- AIPromptModel constraints
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_Status] 
        CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'));
    
    -- Add check constraints for Execution parameters
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_Priority] 
        CHECK ([Priority] >= 0);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ExecutionGroup] 
        CHECK ([ExecutionGroup] >= 0);
    
    -- Add foreign keys
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_PromptID] 
        FOREIGN KEY([PromptID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_PromptID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_ModelID] 
        FOREIGN KEY([ModelID]) REFERENCES [${flyway:defaultSchema}].[AIModel] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_ModelID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_VendorID] 
        FOREIGN KEY([VendorID]) REFERENCES [${flyway:defaultSchema}].[AIVendor] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_VendorID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] WITH CHECK ADD CONSTRAINT [FK_AIPromptModel_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] CHECK CONSTRAINT [FK_AIPromptModel_ConfigurationID];
    
    -- Insert a default configuration
    INSERT INTO [${flyway:defaultSchema}].[AIConfiguration] ([Name], [Description], [IsDefault], [Status])
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
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The name of the configuration.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'Name'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Detailed description of the configuration.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'Description'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Indicates whether this is the default configuration to use when none is specified.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'IsDefault'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The current status of the configuration. Values include Active, Inactive, Deprecated, and Preview.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'Status'

-- AIConfigurationParam table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Stores configuration parameters that can be referenced by prompts and used to control execution behavior.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfigurationParam'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The name of the configuration parameter.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Name'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The data type of the parameter (string, number, boolean, date, object).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Type'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The value of the parameter, stored as a string but interpreted according to the Type.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Value'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Detailed description of the parameter and its usage.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfigurationParam', 
    @level2type=N'COLUMN',@level2name=N'Description'

-- AIPrompt new columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the type of AI model this prompt is designed for (LLM, Image, Audio, etc.).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'AIModelTypeID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The minimum power rank required for models to be considered for this prompt.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'MinPowerRank'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Determines how models are selected for this prompt (Default, Specific, ByPower).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'SelectionStrategy'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When using ByPower selection strategy, determines whether to prefer highest, lowest, or balanced power models.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'PowerPreference'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Controls parallelization: None (no parallelization), StaticCount (use AIPrompt.ParallelCount for total runs), ConfigParam (use config param specified in ParallelConfigParam for total runs), or ModelSpecific (check each AIPromptModel''s individual settings).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ParallelizationMode'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When ParallelizationMode is StaticCount, specifies the number of parallel executions.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ParallelCount'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When ParallelizationMode is ConfigParam, specifies the name of the configuration parameter that contains the parallel count.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ParallelConfigParam'

-- AIPromptModel table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Associates AI prompts with specific models and configurations, including execution details.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the AI prompt this model association applies to.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'PromptID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the AI model to use for this prompt.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ModelID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional reference to a specific vendor for the model. If NULL, uses the highest priority vendor for the model.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'VendorID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional reference to a specific configuration. If NULL, this model is available in all configurations.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Priority of this model for the prompt. Higher values indicate higher priority.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'Priority'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Execution group for parallel processing. Models with the same group are executed in parallel.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ExecutionGroup'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'JSON-formatted parameters specific to this model (temperature, max tokens, etc.).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ModelParameters'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The current status of this model configuration. Values include Active, Inactive, Deprecated, and Preview.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'Status'



/************************************************************************************************
 ************************************************************************************************ 
        PART 3 - AI Agent Enhancements
 ************************************************************************************************ 
 ***********************************************************************************************/
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
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] ADD
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
    CREATE TABLE [${flyway:defaultSchema}].[AIAgentPrompt](
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
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD
        [OutputType] [nvarchar](50) NOT NULL DEFAULT('string'),        -- string, number, boolean, date, object
        [OutputExample] [nvarchar](max) NULL,                          -- JSON Example output to validate against when OutputType is 'object'
        [ValidationBehavior] [nvarchar](50) NOT NULL DEFAULT('Warn');  -- Strict, Warn, None

    -- ---------------------------------------------------------------------------
    -- Enhance AIConfiguration table with default prompts
    -- ---------------------------------------------------------------------------
    ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] ADD
        [DefaultPromptForContextCompressionID] [uniqueidentifier] NULL,   -- Default prompt for context compression
        [DefaultPromptForContextSummarizationID] [uniqueidentifier] NULL; -- Default prompt for context summarization
        
    -- Add unique constraint for agent-prompt combinations
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] ADD CONSTRAINT [UQ_AIAgentPrompt_Agent_Prompt_Config] 
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
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] WITH CHECK ADD CONSTRAINT [FK_AIAgent_ParentID] 
        FOREIGN KEY([ParentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] CHECK CONSTRAINT [FK_AIAgent_ParentID];
    
    -- Add foreign key to AIPrompt for compression prompt
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] WITH CHECK ADD CONSTRAINT [FK_AIAgent_ContextCompressionPromptID] 
        FOREIGN KEY([ContextCompressionPromptID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] CHECK CONSTRAINT [FK_AIAgent_ContextCompressionPromptID];
    
    -- Ensure only root nodes can be exposed as actions
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] ADD CONSTRAINT [CK_AIAgent_ExposeAsAction]
        CHECK ((ParentID IS NULL) OR (ExposeAsAction = 0));
    
    -- Add check constraint on ExecutionMode
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] ADD CONSTRAINT [CK_AIAgent_ExecutionMode]
        CHECK ([ExecutionMode] IN (N'Sequential', N'Parallel'));
    
    -- Ensure compression fields are provided if compression is enabled
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent] ADD CONSTRAINT [CK_AIAgent_CompressionFields]
        CHECK (([EnableContextCompression] = 0) OR 
               ([ContextCompressionMessageThreshold] IS NOT NULL AND 
                [ContextCompressionPromptID] IS NOT NULL AND
                [ContextCompressionMessageRetentionCount] IS NOT NULL));
    
    -- ---------------------------------------------------------------------------
    -- AIAgentPrompt constraints
    -- ---------------------------------------------------------------------------
    
    -- Add foreign keys
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] WITH CHECK ADD CONSTRAINT [FK_AIAgentPrompt_AgentID] 
        FOREIGN KEY([AgentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] CHECK CONSTRAINT [FK_AIAgentPrompt_AgentID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] WITH CHECK ADD CONSTRAINT [FK_AIAgentPrompt_PromptID] 
        FOREIGN KEY([PromptID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] CHECK CONSTRAINT [FK_AIAgentPrompt_PromptID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] WITH CHECK ADD CONSTRAINT [FK_AIAgentPrompt_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration]([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] CHECK CONSTRAINT [FK_AIAgentPrompt_ConfigurationID];
    
    -- Status constraint
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] ADD CONSTRAINT [CK_AIAgentPrompt_Status]
        CHECK ([Status] IN ('Active', 'Inactive', 'Deprecated', 'Preview'));
    
    -- Context behavior constraint
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] ADD CONSTRAINT [CK_AIAgentPrompt_ContextBehavior]
        CHECK ([ContextBehavior] IN (
            'Complete',        -- Include the complete conversation history
            'Smart',           -- Intelligently filter for relevant messages
            'None',            -- No conversation history
            'RecentMessages',  -- Only include the most recent N messages
            'InitialMessages', -- Only include the first N messages
            'Custom'           -- Custom filtering logic
        ));
    
    -- Ensure MessageCount is provided when needed
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] ADD CONSTRAINT [CK_AIAgentPrompt_ContextMessageCount]
        CHECK (([ContextBehavior] NOT IN ('RecentMessages', 'InitialMessages')) 
            OR ([ContextMessageCount] IS NOT NULL));
    
    -- ---------------------------------------------------------------------------
    -- AIPrompt constraints for structured output
    -- ---------------------------------------------------------------------------
    
    -- Add check constraint on OutputType
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_OutputType]
        CHECK ([OutputType] IN ('string', 'number', 'boolean', 'date', 'object'));
    
    -- Ensure schema is provided for object output type
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_OutputExample]
        CHECK (([OutputType] <> 'object') OR ([OutputExample] IS NOT NULL));

    -- Add check constraint on ValidationBehavior
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ValidationBehavior]
        CHECK ([ValidationBehavior] IN ('Strict', 'Warn', 'None'));
    
    -- ---------------------------------------------------------------------------
    -- AIConfiguration constraints for default prompts
    -- ---------------------------------------------------------------------------
    
    -- Add foreign keys for default prompts
    ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] WITH CHECK ADD CONSTRAINT [FK_AIConfiguration_DefaultPromptForContextCompressionID] 
        FOREIGN KEY([DefaultPromptForContextCompressionID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] WITH CHECK ADD CONSTRAINT [FK_AIConfiguration_DefaultPromptForContextSummarizationID] 
        FOREIGN KEY([DefaultPromptForContextSummarizationID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
    
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
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ParentID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, this agent can be exposed as an action for use by other agents. Only valid for root agents.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ExposeAsAction'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The order in which this agent should be executed among its siblings under the same parent.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ExecutionOrder'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Controls how this agent''s child agents are executed. Sequential runs children in order, Parallel runs them simultaneously.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ExecutionMode'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, enables automatic compression of conversation context when the message threshold is reached.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'EnableContextCompression'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of messages that triggers context compression when EnableContextCompression is true.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ContextCompressionMessageThreshold'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of recent messages to keep uncompressed when context compression is applied.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgent', 
    @level2type=N'COLUMN',@level2name=N'ContextCompressionMessageRetentionCount'

-- AIAgentPrompt table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Links AI agents with the prompts they use, including execution order and context handling.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the agent this prompt is associated with.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'AgentID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References the prompt to be used by the agent.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'PromptID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The functional purpose of this prompt within the agent, such as "Initialize", "ProcessData", or "Summarize".' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'Purpose'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The sequence order in which this prompt should be executed within the agent''s workflow.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ExecutionOrder'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional reference to a specific configuration to use for this prompt. If NULL, uses the default configuration.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The current status of this agent-prompt mapping. Values include Active, Inactive, Deprecated, and Preview.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'Status'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Determines how conversation context is filtered for this prompt: Complete, Smart, None, RecentMessages, InitialMessages, or Custom.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ContextBehavior'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The number of messages to include when ContextBehavior is set to RecentMessages or InitialMessages.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIAgentPrompt', 
    @level2type=N'COLUMN',@level2name=N'ContextMessageCount'

-- AIPrompt new columns for structured output
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The expected data type of the prompt output: string, number, boolean, date, or object.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'OutputType'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'JSON example output when OutputType is "object", used for validating structured outputs.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'OutputExample'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Determines how validation failures are handled: Strict (fail), Warn (log warning), or None (ignore).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ValidationBehavior'

-- AIConfiguration new columns for default prompts
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Default prompt to use for context compression when not specified at the agent level.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'DefaultPromptForContextCompressionID'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Default prompt to use for context summarization when not specified at the agent level.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIConfiguration', 
    @level2type=N'COLUMN',@level2name=N'DefaultPromptForContextSummarizationID'


/************************************************************************************************
 ************************************************************************************************ 
        PART 4 -  AI Prompt Enhancement Schema - Retries, Parallelization, and Result Selection
 ************************************************************************************************ 
 ***********************************************************************************************/

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
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD
        [MaxRetries] [int] NOT NULL DEFAULT(0),                   -- Maximum number of retry attempts
        [RetryDelayMS] [int] NOT NULL DEFAULT(0),                 -- Delay between retries in milliseconds
        [RetryStrategy] [nvarchar](20) NOT NULL DEFAULT('Fixed'), -- Fixed, Exponential, Linear
        [ResultSelectorPromptID] [uniqueidentifier] NULL;         -- Reference to a prompt that selects the best result

    -- Then add model-specific parallelization to AIPromptModel
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD
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
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_RetryStrategy]
        CHECK ([RetryStrategy] IN (N'Fixed', N'Exponential', N'Linear'));

    -- ---------------------------------------------------------------------------
    -- 2. Update parallelization approach
    -- ---------------------------------------------------------------------------
    
    -- First, update AIPrompt.ParallelizationMode to include ModelSpecific option
    -- This requires dropping the constraint, updating it, and re-adding it
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] DROP CONSTRAINT [CK_AIPrompt_ParallelizationMode];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ParallelizationMode]
        CHECK ([ParallelizationMode] IN (N'None', N'StaticCount', N'ConfigParam', N'ModelSpecific'));
    

    -- Add check constraint on ParallelizationMode
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ParallelizationMode]
        CHECK ([ParallelizationMode] IN (N'None', N'StaticCount', N'ConfigParam'));
    
    -- Add constraint to ensure ParallelCount is at least 1
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ParallelCount]
        CHECK ([ParallelCount] >= 1);
    
    -- Add constraint to ensure parallelization mode and parameters match
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD CONSTRAINT [CK_AIPromptModel_ParallelModeParams]
        CHECK (
            ([ParallelizationMode] = 'None') OR
            ([ParallelizationMode] = 'StaticCount' AND [ParallelConfigParam] IS NULL) OR
            ([ParallelizationMode] = 'ConfigParam' AND [ParallelConfigParam] IS NOT NULL)
        );

    -- Add foreign key to AIPrompt
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] WITH CHECK ADD CONSTRAINT [FK_AIPrompt_ResultSelectorPromptID] 
        FOREIGN KEY([ResultSelectorPromptID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] CHECK CONSTRAINT [FK_AIPrompt_ResultSelectorPromptID];
    
    -- Add check constraint to prevent a prompt from being its own selector
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_ResultSelectorPromptID]
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
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'MaxRetries'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Delay between retry attempts in milliseconds.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'RetryDelayMS'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Strategy for calculating retry delays: Fixed (same delay each time), Exponential (doubling delay), or Linear (linearly increasing delay).' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'RetryStrategy'


-- AIPromptModel parallelization fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Controls how this model participates in parallelization: None, StaticCount, or ConfigParam.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ParallelizationMode'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of parallel executions to perform with this model when ParallelizationMode is StaticCount.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ParallelCount'

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Name of a configuration parameter that contains the parallel count when ParallelizationMode is ConfigParam.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptModel', 
    @level2type=N'COLUMN',@level2name=N'ParallelConfigParam'

-- AIPrompt selector fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'References another prompt that selects the best result from multiple parallel executions.' , 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'ResultSelectorPromptID'



/************************************************************************************************
 ************************************************************************************************ 
        PART 5 - AI Prompt Logging and Caching Schema
 ************************************************************************************************ 
 ***********************************************************************************************/

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
    CREATE TABLE [${flyway:defaultSchema}].[AIPromptRun](
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

    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] DROP CONSTRAINT [DF__AIPrompt__CacheR__3C94E422]
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] DROP CONSTRAINT [DF__AIPrompt__CacheE__3D89085B]

    -- Drop existing cache columns that will be replaced
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] DROP COLUMN 
        [CacheResults],  -- Will be replaced by EnableCaching
        [CacheExpiration]; -- Will be replaced by CacheTTLSeconds
    
    -- Add caching control fields to AIPrompt
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD
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
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] ADD
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
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_CacheMatchType]
        CHECK ([CacheMatchType] IN (N'Exact', N'Vector'));
    
    -- Add check constraint on CacheSimilarityThreshold
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_CacheSimilarityThreshold]
        CHECK ([CacheSimilarityThreshold] IS NULL OR 
               ([CacheSimilarityThreshold] >= 0 AND [CacheSimilarityThreshold] <= 1));
    
    -- Add check constraint to ensure threshold is provided when using Vector matching
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_VectorMatchThreshold]
        CHECK ([CacheMatchType] <> 'Vector' OR [CacheSimilarityThreshold] IS NOT NULL);
    
    -- Add check constraint to ensure TTL is positive when specified
    ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] ADD CONSTRAINT [CK_AIPrompt_CacheTTLSeconds]
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
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_VendorID] 
        FOREIGN KEY([VendorID]) REFERENCES [${flyway:defaultSchema}].[AIVendor] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_VendorID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_AgentID] 
        FOREIGN KEY([AgentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_AgentID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_ConfigurationID];
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] WITH CHECK ADD CONSTRAINT [FK_AIResultCache_PromptRunID] 
        FOREIGN KEY([PromptRunID]) REFERENCES [${flyway:defaultSchema}].[AIPromptRun] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIResultCache] CHECK CONSTRAINT [FK_AIResultCache_PromptRunID];
    
    -- Add index for efficient cache lookups
    CREATE INDEX [IX_AIResultCache_Lookup] ON [${flyway:defaultSchema}].[AIResultCache]
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
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_PromptID] 
        FOREIGN KEY([PromptID]) REFERENCES [${flyway:defaultSchema}].[AIPrompt] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_PromptID];
    
    -- Add foreign key to AIModel
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_ModelID] 
        FOREIGN KEY([ModelID]) REFERENCES [${flyway:defaultSchema}].[AIModel] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_ModelID];
    
    -- Add foreign key to AIVendor
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_VendorID] 
        FOREIGN KEY([VendorID]) REFERENCES [${flyway:defaultSchema}].[AIVendor] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_VendorID];
    
    -- Add foreign key to AIConfiguration
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_ConfigurationID] 
        FOREIGN KEY([ConfigurationID]) REFERENCES [${flyway:defaultSchema}].[AIConfiguration] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_ConfigurationID];
    
    -- Add foreign key to AIAgent
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] WITH CHECK ADD CONSTRAINT [FK_AIPromptRun_AgentID] 
        FOREIGN KEY([AgentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent] ([ID]);
    
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] CHECK CONSTRAINT [FK_AIPromptRun_AgentID];
    
    -- Add check constraint for timing fields
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ADD CONSTRAINT [CK_AIPromptRun_Timing]
        CHECK ([CompletedAt] IS NULL OR [CompletedAt] >= [RunAt]);
    
    -- Add check constraint for token counts
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ADD CONSTRAINT [CK_AIPromptRun_Tokens]
        CHECK (
            ([TokensPrompt] IS NULL AND [TokensCompletion] IS NULL) OR
            ([TokensUsed] IS NULL) OR
            ([TokensUsed] = [TokensPrompt] + [TokensCompletion])
        );
    
    -- Add index for common queries
    CREATE INDEX [IX_AIPromptRun_PromptID_RunAt] ON [${flyway:defaultSchema}].[AIPromptRun]([PromptID], [RunAt] DESC);
    CREATE INDEX [IX_AIPromptRun_AgentID_RunAt] ON [${flyway:defaultSchema}].[AIPromptRun]([AgentID], [RunAt] DESC) WHERE [AgentID] IS NOT NULL;
    
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
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun';

-- Column descriptions for AIPromptRun
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The prompt that was executed.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'PromptID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The AI model used for execution.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ModelID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The vendor providing the model/inference.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'VendorID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'If this prompt was run as part of an agent, references the agent.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'AgentID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Optional configuration used for this execution.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When the prompt execution started.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'RunAt';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When the prompt execution finished. NULL indicates a pending or interrupted execution.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'CompletedAt';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Total execution time in milliseconds.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ExecutionTimeMS';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The input messages sent to the model, typically in JSON format.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'Messages';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The output result from the model.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'Result';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Total number of tokens used (prompt + completion).', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TokensUsed';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of tokens in the prompt.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TokensPrompt';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Number of tokens in the completion/result.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TokensCompletion';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Estimated cost of this execution in USD.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'TotalCost';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Whether the execution was successful.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'Success';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Error message if the execution failed.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'COLUMN',@level2name=N'ErrorMessage';

-- Constraint descriptions for AIPromptRun
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Ensures that CompletedAt is after RunAt when present.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'CONSTRAINT',@level2name=N'CK_AIPromptRun_Timing';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Ensures token counts are consistent when present.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPromptRun', 
    @level2type=N'CONSTRAINT',@level2name=N'CK_AIPromptRun_Tokens';

-- Column descriptions for AIPrompt caching fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, results from this prompt will be cached for potential reuse.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'EnableCaching';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Time-to-live in seconds for cached results. NULL means results never expire.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheTTLSeconds';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Method for matching cached results: Exact (string matching) or Vector (embedding similarity).', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMatchType';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Threshold (0-1) for vector similarity matching. Higher values require closer matches.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheSimilarityThreshold';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the AI model must match for a cache hit. When false, results from any model can be used.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchModel';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the vendor must match for a cache hit. When false, results from any vendor can be used.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchVendor';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the agent context must match for a cache hit. When false, agent-specific and non-agent results can be used interchangeably.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchAgent';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'When true, the configuration must match for a cache hit. When false, results from any configuration can be used.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIPrompt', 
    @level2type=N'COLUMN',@level2name=N'CacheMustMatchConfig';

-- Column descriptions for AIResultCache new fields
EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The vendor that provided this result.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'VendorID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The agent that initiated the request, if any.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'AgentID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'The configuration used for this execution.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'ConfigurationID';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Vector representation of the prompt for similarity matching.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'PromptEmbedding';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', 
    @value=N'Reference to the AIPromptRun that created this cache entry.', 
    @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE',@level1name=N'AIResultCache', 
    @level2type=N'COLUMN',@level2name=N'PromptRunID';


/************************************************************************************************
 ************************************************************************************************ 
        PART 6 - Custom Metadata Tweaks
 ************************************************************************************************ 
 ***********************************************************************************************/

-- 1) Add schema to Application table
-- Add the SchemaAutoAddNewEntities column to the ${flyway:defaultSchema}.Application table
  ALTER TABLE [${flyway:defaultSchema}].[Application]
  ADD [SchemaAutoAddNewEntities] NVARCHAR(MAX) NULL;

  -- Add documentation for the SchemaAutoAddNewEntities column
  EXEC sp_addextendedproperty
      @name = N'MS_Description',
      @value = N'Comma-delimited list of schema names where entities will be automatically added to the application when created in those schemas',
      @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
      @level1type = N'TABLE',  @level1name = N'Application',
      @level2type = N'COLUMN', @level2name = N'SchemaAutoAddNewEntities';

-- 2) Remove fields from AIPrompt that we removed for Cache... replaced by new fields
  DELETE FROM ${flyway:defaultSchema}.EntityField WHERE ID IN ('F773433E-F36B-1410-883E-00D02208DC50','F673433E-F36B-1410-883E-00D02208DC50') -- Name IN ('CacheResults','CacheExpiration'), AIPrompt table

-- 3) Update Entity Metadata for AI Models entity to reflect we have a CUSTOM base view
  UPDATE ${flyway:defaultSchema}.Entity SET BaseViewGenerated=0, BaseView='vwAIModels_Custom' WHERE ID='FD238F34-2837-EF11-86D4-6045BDEE16E6' -- Name='AI Models'

/************************************************************************************************
 ************************************************************************************************ 
        PART 7 - CodeGen OUTPUT
 ************************************************************************************************ 
 ***********************************************************************************************/
