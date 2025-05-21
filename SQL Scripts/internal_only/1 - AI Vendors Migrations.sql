-- ---------------------------------------------------------------------------
-- MemberJunction AI Schema Migration
-- 
-- This script creates new tables for the enhanced AI architecture:
-- 1. AIVendor - Stores information about AI vendors
-- 2. AIVendorTypeDefinition - Defines vendor types (Model Developer, Inference Provider)
-- 3. AIVendorType - Links vendors to their types with priority rankings
-- 4. AIModelVendor - Links models to vendors with implementation details
-- 5. vwAIModels - View for backward compatibility
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
	CREATE TABLE [__mj].[AIVendor](
		[ID] [uniqueidentifier] NOT NULL,
		[Name] [nvarchar](50) NOT NULL,
		[Description] [nvarchar](max) NULL,
	 CONSTRAINT [PK_AIVendor_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	ALTER TABLE [__mj].[AIVendor] ADD CONSTRAINT [DF__AIVendor__ID]  DEFAULT (newsequentialid()) FOR [ID]

	-- Add a unique constraint on Name
	ALTER TABLE [__mj].[AIVendor] ADD CONSTRAINT [UQ_AIVendor_Name] UNIQUE ([Name])

	-- ---------------------------------------------------------------------------
	-- Create AIVendorTypeDefinition table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [__mj].[AIVendorTypeDefinition](
		[ID] [uniqueidentifier] NOT NULL,
		[Name] [nvarchar](50) NOT NULL,
		[Description] [nvarchar](max) NULL,
	 CONSTRAINT [PK_AIVendorTypeDefinition_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	-- No default for ID as we'll insert specific UUIDs

	-- Add a unique constraint on Name
	ALTER TABLE [__mj].[AIVendorTypeDefinition] ADD CONSTRAINT [UQ_AIVendorTypeDefinition_Name] UNIQUE ([Name])

	-- ---------------------------------------------------------------------------
	-- Create AIVendorType table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [__mj].[AIVendorType](
		[ID] [uniqueidentifier] NOT NULL,
		[VendorID] [uniqueidentifier] NOT NULL,
		[TypeID] [uniqueidentifier] NOT NULL,
		[Rank] [int] NOT NULL,
		[Status] [nvarchar](20) NOT NULL,
	 CONSTRAINT [PK_AIVendorType_ID] PRIMARY KEY CLUSTERED 
	(
		[ID] ASC
	))

	ALTER TABLE [__mj].[AIVendorType] ADD CONSTRAINT [DF__AIVendorType__ID]  DEFAULT (newsequentialid()) FOR [ID]

	ALTER TABLE [__mj].[AIVendorType] ADD CONSTRAINT [DF__AIVendorType__Rank]  DEFAULT ((0)) FOR [Rank]

	ALTER TABLE [__mj].[AIVendorType] ADD CONSTRAINT [DF__AIVendorType__Status]  DEFAULT (N'Active') FOR [Status]

	-- Add foreign key constraints
	ALTER TABLE [__mj].[AIVendorType] WITH CHECK ADD CONSTRAINT [FK_AIVendorType_AIVendor] FOREIGN KEY([VendorID])
	REFERENCES [__mj].[AIVendor] ([ID])

	ALTER TABLE [__mj].[AIVendorType] CHECK CONSTRAINT [FK_AIVendorType_AIVendor]

	ALTER TABLE [__mj].[AIVendorType] WITH CHECK ADD CONSTRAINT [FK_AIVendorType_AIVendorTypeDefinition] FOREIGN KEY([TypeID])
	REFERENCES [__mj].[AIVendorTypeDefinition] ([ID])

	ALTER TABLE [__mj].[AIVendorType] CHECK CONSTRAINT [FK_AIVendorType_AIVendorTypeDefinition]

	-- Add check constraint on Status
	ALTER TABLE [__mj].[AIVendorType] ADD CONSTRAINT [CK_AIVendorType_Status] CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'))

	-- Add check constraint on Rank
	ALTER TABLE [__mj].[AIVendorType] ADD CONSTRAINT [CK_AIVendorType_Rank] CHECK ([Rank] >= 0)

	-- Add unique constraint to prevent duplicate vendor-type combinations
	ALTER TABLE [__mj].[AIVendorType] ADD CONSTRAINT [UQ_AIVendorType_VendorID_TypeID] UNIQUE ([VendorID], [TypeID])

	-- ---------------------------------------------------------------------------
	-- Create AIModelVendor table
	-- ---------------------------------------------------------------------------
	CREATE TABLE [__mj].[AIModelVendor](
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

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__ID]  DEFAULT (newsequentialid()) FOR [ID]

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__Priority]  DEFAULT ((0)) FOR [Priority]

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__Status]  DEFAULT (N'Active') FOR [Status]

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__SupportedResponseFormats]  DEFAULT (N'Any') FOR [SupportedResponseFormats]

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__SupportsEffortLevel]  DEFAULT ((0)) FOR [SupportsEffortLevel]

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [DF__AIModelVendor__SupportsStreaming]  DEFAULT ((0)) FOR [SupportsStreaming]

	-- Add foreign key constraints
	ALTER TABLE [__mj].[AIModelVendor] WITH CHECK ADD CONSTRAINT [FK_AIModelVendor_AIModel] FOREIGN KEY([ModelID])
	REFERENCES [__mj].[AIModel] ([ID])

	ALTER TABLE [__mj].[AIModelVendor] CHECK CONSTRAINT [FK_AIModelVendor_AIModel]
	
	ALTER TABLE [__mj].[AIModelVendor] WITH CHECK ADD CONSTRAINT [FK_AIModelVendor_AIVendor] FOREIGN KEY([VendorID])
	REFERENCES [__mj].[AIVendor] ([ID])

	ALTER TABLE [__mj].[AIModelVendor] CHECK CONSTRAINT [FK_AIModelVendor_AIVendor]

	-- Add check constraint on Status
	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_Status] CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'))

	-- Add check constraint on Priority
	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_Priority] CHECK ([Priority] >= 0)

	-- Add check constraints on token limits
	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_MaxInputTokens] CHECK ([MaxInputTokens] IS NULL OR [MaxInputTokens] >= 0)

	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [CK_AIModelVendor_MaxOutputTokens] CHECK ([MaxOutputTokens] IS NULL OR [MaxOutputTokens] >= 0)

	-- Add unique constraint to prevent duplicate model-vendor combinations
	ALTER TABLE [__mj].[AIModelVendor] ADD CONSTRAINT [UQ_AIModelVendor_ModelID_VendorID] UNIQUE ([ModelID], [VendorID])

	-- ---------------------------------------------------------------------------
	-- VERSION INFORMATION - UPDATE THIS WHEN RELEASING
	-- ---------------------------------------------------------------------------
	DECLARE @MJ_VERSION varchar(20) = '2.42.0';

	-- ---------------------------------------------------------------------------
	-- Add new AuditLogType for migration tracking
	-- ---------------------------------------------------------------------------
	INSERT INTO [__mj].[AuditLogType] ([ID], [Name], [Description], [ParentID], [AuthorizationID])
	VALUES ('A842FE1D-C7BF-4724-9D6D-37D225D4E36B', 'Migration Log', 'Notes from MJ Migrations', NULL, NULL)

    -- Declare variables for logging
    DECLARE @MigrationLogTypeID uniqueidentifier = 'A842FE1D-C7BF-4724-9D6D-37D225D4E36B';
    DECLARE @SystemUserID uniqueidentifier = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Hardcoded system user ID
    
    -- Insert migration start log
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | AI Architecture Migration Started', 
     'Starting migration to new AI vendor and model architecture');

    -- Insert predefined AIVendorTypeDefinition records with fixed IDs
    INSERT INTO [__mj].[AIVendorTypeDefinition] ([ID], [Name], [Description])
    VALUES 
    ('10DB468E-F2CE-475D-9F39-2DF2DE75D257', 'Model Developer', 'Companies that develop and train AI models'),
    ('5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', 'Inference Provider', 'Companies that provide inference services for AI models');

    -- Log vendor type definitions created
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Vendor type definitions created');

    -- Extract unique vendors from AIModel and use the oldest row's ID for each vendor
    WITH VendorIDs AS (
        SELECT 
            [Vendor] AS VendorName,
            (SELECT TOP 1 [ID] FROM [__mj].[AIModel] m2 
             WHERE m2.[Vendor] = m1.[Vendor] 
             ORDER BY m2.[__mj_CreatedAt]) AS OldestID
        FROM 
            [__mj].[AIModel] m1
        WHERE 
            [Vendor] IS NOT NULL
        GROUP BY 
            [Vendor]
    )
    INSERT INTO [__mj].[AIVendor] ([ID], [Name], [Description])
    SELECT 
        v.OldestID,
        v.VendorName,
        'AI Vendor'
    FROM 
        VendorIDs v;

    -- Log vendors migrated
    DECLARE @VendorCount int;
    SELECT @VendorCount = COUNT(*) FROM [__mj].[AIVendor];
    
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Vendors migrated', 
     'Migrated ' + CAST(@VendorCount AS varchar) + ' unique vendors to AIVendor table.');

    -- Get the predefined type IDs
    DECLARE @ModelDeveloperTypeID uniqueidentifier = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
    DECLARE @InferenceProviderTypeID uniqueidentifier = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

    -- Insert vendor types for all vendors
    INSERT INTO [__mj].[AIVendorType] ([VendorID], [TypeID], [Rank], [Status])
    SELECT 
        v.[ID],
        @ModelDeveloperTypeID,
        10, -- Higher priority for Model Developer
        'Active'
    FROM 
        [__mj].[AIVendor] v;

    -- Log Model Developer types set
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Set Model Developer type for all vendors');

    INSERT INTO [__mj].[AIVendorType] ([VendorID], [TypeID], [Rank], [Status])
    SELECT 
        v.[ID],
        @InferenceProviderTypeID,
        5, -- Lower priority for Inference Provider
        'Active'
    FROM 
        [__mj].[AIVendor] v;

    -- Log Inference Provider types set
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Set Inference Provider type for all vendors');

    -- Create entries in AIModelVendor
    INSERT INTO [__mj].[AIModelVendor] (
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
        [__mj].[AIModel] m
    JOIN 
        [__mj].[AIVendor] v ON m.[Vendor] = v.[Name]
    WHERE 
        m.[Vendor] IS NOT NULL;

    -- Log model-vendor relationships created
    DECLARE @ModelVendorCount int;
    SELECT @ModelVendorCount = COUNT(*) FROM [__mj].[AIModelVendor];
    
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Model-vendor relationships created', 
     'Created ' + CAST(@ModelVendorCount AS varchar) + ' model-vendor relationships in AIModelVendor table.');

    -- Set SupportsStreaming based on a heuristic
    UPDATE [__mj].[AIModelVendor]
    SET [SupportsStreaming] = 1
    WHERE 
        [ModelID] IN (
            SELECT [ID] FROM [__mj].[AIModel] 
            WHERE [Name] LIKE '%GPT-4%' OR [Name] LIKE '%Claude%' OR [Name] LIKE '%Gemini%'
        );

    -- Log streaming support updated
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | Updated streaming support for newer models');

    -- Log migration completion
    INSERT INTO [__mj].[AuditLog] 
    ([UserID], [AuditLogTypeID], [Status], [Description], [Details])
    VALUES 
    (@SystemUserID, @MigrationLogTypeID, 'Success', 'MJ Upgrade: ' + @MJ_VERSION + ' | AI Architecture Migration Completed', 
     'Successfully migrated to new AI vendor and model architecture');

	-- now, only if the above worked, get rid of the old columns and then create the new vwAIModels view
	-- ---------------------------------------------------------------------------
	-- Remove redundant columns from AIModel (now stored in AIModelVendor)
	-- ---------------------------------------------------------------------------
	ALTER TABLE __mj.AIModel
		DROP CONSTRAINT 
			[DF__AIModel__Support__61274A53],
			[DF__AIModel__Support__7C655074];

	ALTER TABLE [__mj].[AIModel] 
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
DROP VIEW IF EXISTS __mj.vwAIModels;
GO
CREATE VIEW [__mj].[vwAIModels]
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
	[__mj].[AIModel] m
INNER JOIN
	[__mj].[AIModelType] AS AIModelType_AIModelTypeID
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
		[__mj].[AIModelVendor] mv
	WHERE
		mv.[ModelID] = m.[ID]
		AND mv.[Status] = 'Active'
	ORDER BY 
		mv.[Priority] DESC
) mv
LEFT JOIN [__mj].[AIVendor] v ON mv.[VendorID] = v.[ID]
GO


-- ---------------------------------------------------------------------------
-- Extended properties for documentation
-- ---------------------------------------------------------------------------

-- AIVendor table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Stores information about AI vendors providing models and/or inference services.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendor'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The unique name of the vendor.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendor', @level2type=N'COLUMN',@level2name=N'Name'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description of the vendor and their AI offerings.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendor', @level2type=N'COLUMN',@level2name=N'Description'
GO

-- AIVendorTypeDefinition table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Defines the possible types of AI vendors, such as Model Developer or Inference Provider.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendorTypeDefinition'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The name of the vendor type.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendorTypeDefinition', @level2type=N'COLUMN',@level2name=N'Name'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description of the vendor type.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendorTypeDefinition', @level2type=N'COLUMN',@level2name=N'Description'
GO

-- AIVendorType table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Associates vendors with their types (Model Developer, Inference Provider) and tracks the status of each role.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendorType'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Determines the priority rank of this type for the vendor. Higher values indicate higher priority.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendorType', @level2type=N'COLUMN',@level2name=N'Rank'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The current status of this vendor type. Values include Active, Inactive, Deprecated, and Preview.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIVendorType', @level2type=N'COLUMN',@level2name=N'Status'
GO

-- AIModelVendor table and columns
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Associates AI models with vendors providing them, including vendor-specific implementation details.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Determines the priority rank of this vendor for the model. Higher values indicate higher priority.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'Priority'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The current status of this model-vendor combination. Values include Active, Inactive, Deprecated, and Preview.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'Status'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The name of the driver class implementing this model-vendor combination.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'DriverClass'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The import path for the driver class.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'DriverImportPath'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The name of the model to use with API calls, which might differ from the model name. If not provided, the model name will be used.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'APIName'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The maximum number of input tokens supported by this model-vendor implementation.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'MaxInputTokens'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The maximum number of output tokens supported by this model-vendor implementation.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'MaxOutputTokens'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'A comma-delimited string indicating the supported response formats for this model-vendor implementation. Options include Any, Text, Markdown, JSON, and ModelSpecific.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'SupportedResponseFormats'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Specifies if this model-vendor implementation supports the concept of an effort level.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'SupportsEffortLevel'
GO

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Specifies if this model-vendor implementation supports streaming responses.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'TABLE',@level1name=N'AIModelVendor', @level2type=N'COLUMN',@level2name=N'SupportsStreaming'
GO

-- vwAIModels view
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Backward compatibility view that simulates the original AIModel table structure by selecting the highest priority vendor for each model.' , @level0type=N'SCHEMA',@level0name=N'__mj', @level1type=N'VIEW',@level1name=N'vwAIModels'
GO
