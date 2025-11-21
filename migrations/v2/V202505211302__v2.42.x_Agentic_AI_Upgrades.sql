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


   -- Insert static AIVendor records first
   INSERT INTO [${flyway:defaultSchema}].[AIVendor] ([ID], [Name], [Description])
   VALUES 
      ('DAB9433E-F36B-1410-8DA0-00021F8B792E', 'Eleven Labs', 'AI Vendor'),
      ('E1B9433E-F36B-1410-8DA0-00021F8B792E', 'HeyGen', 'AI Vendor'),
      ('D8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 'OpenAI', 'AI Vendor'),
      ('DAA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'Anthropic', 'AI Vendor'),
      ('DBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'Mistral AI', 'AI Vendor'),
      ('E3A5CCEC-6A37-EF11-86D4-000D3A4E707E', 'Groq', 'AI Vendor'),
      ('E4A5CCEC-6A37-EF11-86D4-000D3A4E707E', 'Google', 'AI Vendor'),
      ('27C0423E-F36B-1410-8876-005D02743E8C', 'Tasio Labs', 'AI Vendor');

   -- Extract unique vendors from AIModel and use the oldest row's ID for each vendor
   -- Exclude vendors that were statically inserted above
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
         AND [Vendor] NOT IN ('Eleven Labs', 'HeyGen', 'OpenAI', 'Anthropic', 'Mistral AI', 'Groq', 'Google', 'Tasio Labs')
      GROUP BY 
         [Vendor]
   )
   INSERT INTO [${flyway:defaultSchema}].[AIVendor] ([ID], [Name], [Description])
   SELECT 
      v.OldestID,
      v.VendorName,
      'AI Vendor'
   FROM 
      VendorIDs v
   WHERE 
      NOT EXISTS (
         SELECT 1 
         FROM [${flyway:defaultSchema}].[AIVendor] av 
         WHERE av.[Name] = v.VendorName
      );

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

   -- 1) build a list of DROP CONSTRAINT statements for all default‐ and check‐
   --    constraints on the columns we’re about to remove
   DECLARE
   @sql NVARCHAR(MAX) = N'';

   SELECT
      @sql += N'ALTER TABLE '
            + QUOTENAME(SCHEMA_NAME(o.schema_id)) + N'.'
            + QUOTENAME(o.name)
            + N' DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';' + CHAR(13)
   FROM sys.default_constraints dc
      JOIN sys.objects o ON dc.parent_object_id = o.object_id
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
   WHERE
      SCHEMA_NAME(o.schema_id) = '${flyway:defaultSchema}'
      AND o.name                 = 'AIModel'
      AND c.name IN (
         'Vendor',
         'DriverClass',
         'DriverImportPath',
         'APIName',
         'InputTokenLimit',
         'SupportsEffortLevel',
         'SupportedResponseFormats'
      );

   -- (repeat the same join logic for sys.check_constraints if you have any CHECKs to drop)
   -- SELECT … FROM sys.check_constraints cc … WHERE …  >>

   -- 2) run it
   EXEC sp_executesql @sql;

   -- 3) now that all the unnamed defaults/checks are gone, drop the columns
   ALTER TABLE ${flyway:defaultSchema}.AIModel
      DROP COLUMN
         [Vendor],
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
DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwAIModels;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIModels]
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

   -- =================================================================================
   -- V____drop_AIPrompt_cache.sql
   --   1) dynamically drop any default or check constraints on AIPrompt.CacheResults
   --      and AIPrompt.CacheExpiration (names vary by database)
   --   2) then drop the two columns
   -- =================================================================================

   DECLARE
   @sql NVARCHAR(MAX) = N'';

   -- === 1a) DEFAULT constraints ===
   SELECT
      @sql += N'ALTER TABLE '
            + QUOTENAME(SCHEMA_NAME(o.schema_id)) + N'.'
            + QUOTENAME(o.name)
            + N' DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';' + CHAR(13)
   FROM sys.default_constraints AS dc
   JOIN sys.objects            AS o  ON dc.parent_object_id = o.object_id
   JOIN sys.columns            AS c  ON c.object_id = dc.parent_object_id
                                    AND c.column_id = dc.parent_column_id
   WHERE
      SCHEMA_NAME(o.schema_id) = '${flyway:defaultSchema}'
      AND o.name                 = 'AIPrompt'
      AND c.name IN ('CacheResults','CacheExpiration');

   IF @sql <> N''
   EXEC sp_executesql @sql;

   -- === 2) now drop the columns themselves ===
   ALTER TABLE ${flyway:defaultSchema}.AIPrompt
   DROP COLUMN
      [CacheResults],
      [CacheExpiration];
    
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
  GO

  -- Add documentation for the SchemaAutoAddNewEntities column
  EXEC sp_addextendedproperty
      @name = N'MS_Description',
      @value = N'Comma-delimited list of schema names where entities will be automatically added to the application when created in those schemas',
      @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
      @level1type = N'TABLE',  @level1name = N'Application',
      @level2type = N'COLUMN', @level2name = N'SchemaAutoAddNewEntities';

  -- update the existing app record for Admin
  UPDATE ${flyway:defaultSchema}.Application SET SchemaAutoAddNewEntities='${flyway:defaultSchema}' WHERE ID='EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' --Name='Admin'

  -- refersh the applications view
  EXEC sp_refreshview '${flyway:defaultSchema}.vwApplications'


-- 2) Remove fields from AIPrompt that we removed for Cache... replaced by new fields
  DELETE FROM ${flyway:defaultSchema}.EntityField WHERE ID IN ('F773433E-F36B-1410-883E-00D02208DC50','F673433E-F36B-1410-883E-00D02208DC50') -- Name IN ('CacheResults','CacheExpiration'), AIPrompt table

-- 3) Update Entity Metadata for AI Models entity to reflect we have a CUSTOM base view
  UPDATE ${flyway:defaultSchema}.Entity SET BaseViewGenerated=0 WHERE ID='FD238F34-2837-EF11-86D4-6045BDEE16E6' -- Name='AI Models'




/************************************************************************************************
 ************************************************************************************************ 
        PART 7 - CodeGen OUTPUT
 ************************************************************************************************ 
 ***********************************************************************************************/
/* SQL generated to create new entity MJ: AI Prompt Runs */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '7c1c98d0-3978-4ce8-8e3f-c90301e59767',
         'MJ: AI Prompt Runs',
         NULL,
         NULL,
         'AIPromptRun',
         'vwAIPromptRuns',
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
   

/* SQL generated to add new entity MJ: AI Prompt Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7c1c98d0-3978-4ce8-8e3f-c90301e59767', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Prompt Runs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7c1c98d0-3978-4ce8-8e3f-c90301e59767', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Prompt Runs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7c1c98d0-3978-4ce8-8e3f-c90301e59767', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Prompt Runs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7c1c98d0-3978-4ce8-8e3f-c90301e59767', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Vendors */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'd95a17ee-5750-4218-86ad-10f06e4dfbca',
         'MJ: AI Vendors',
         NULL,
         NULL,
         'AIVendor',
         'vwAIVendors',
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
   

/* SQL generated to add new entity MJ: AI Vendors to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd95a17ee-5750-4218-86ad-10f06e4dfbca', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Vendors for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d95a17ee-5750-4218-86ad-10f06e4dfbca', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Vendors for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d95a17ee-5750-4218-86ad-10f06e4dfbca', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Vendors for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d95a17ee-5750-4218-86ad-10f06e4dfbca', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Vendor Type Definitions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'c1d5e9a9-133c-4e73-9dfa-6cc00a4611c1',
         'MJ: AI Vendor Type Definitions',
         NULL,
         NULL,
         'AIVendorTypeDefinition',
         'vwAIVendorTypeDefinitions',
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
   

/* SQL generated to add new entity MJ: AI Vendor Type Definitions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c1d5e9a9-133c-4e73-9dfa-6cc00a4611c1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Vendor Type Definitions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c1d5e9a9-133c-4e73-9dfa-6cc00a4611c1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Vendor Type Definitions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c1d5e9a9-133c-4e73-9dfa-6cc00a4611c1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Vendor Type Definitions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c1d5e9a9-133c-4e73-9dfa-6cc00a4611c1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Vendor Types */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ba778f47-5a73-4ea6-b8c6-876f5d68fe3f',
         'MJ: AI Vendor Types',
         NULL,
         NULL,
         'AIVendorType',
         'vwAIVendorTypes',
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
   

/* SQL generated to add new entity MJ: AI Vendor Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ba778f47-5a73-4ea6-b8c6-876f5d68fe3f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Vendor Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba778f47-5a73-4ea6-b8c6-876f5d68fe3f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Vendor Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba778f47-5a73-4ea6-b8c6-876f5d68fe3f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Vendor Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba778f47-5a73-4ea6-b8c6-876f5d68fe3f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Model Vendors */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f386546e-ec07-46e6-b780-6b1fea5892e6',
         'MJ: AI Model Vendors',
         NULL,
         NULL,
         'AIModelVendor',
         'vwAIModelVendors',
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
   

/* SQL generated to add new entity MJ: AI Model Vendors to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f386546e-ec07-46e6-b780-6b1fea5892e6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Model Vendors for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f386546e-ec07-46e6-b780-6b1fea5892e6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Model Vendors for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f386546e-ec07-46e6-b780-6b1fea5892e6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Model Vendors for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f386546e-ec07-46e6-b780-6b1fea5892e6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Configurations */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '6ae1bbf0-2085-4d2f-b724-219dc4212026',
         'MJ: AI Configurations',
         NULL,
         NULL,
         'AIConfiguration',
         'vwAIConfigurations',
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
   

/* SQL generated to add new entity MJ: AI Configurations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '6ae1bbf0-2085-4d2f-b724-219dc4212026', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Configurations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6ae1bbf0-2085-4d2f-b724-219dc4212026', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Configurations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6ae1bbf0-2085-4d2f-b724-219dc4212026', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Configurations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6ae1bbf0-2085-4d2f-b724-219dc4212026', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Configuration Params */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '02b2ecdf-fc92-4d19-b332-f840ea708565',
         'MJ: AI Configuration Params',
         NULL,
         NULL,
         'AIConfigurationParam',
         'vwAIConfigurationParams',
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
   

/* SQL generated to add new entity MJ: AI Configuration Params to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '02b2ecdf-fc92-4d19-b332-f840ea708565', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Configuration Params for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('02b2ecdf-fc92-4d19-b332-f840ea708565', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Configuration Params for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('02b2ecdf-fc92-4d19-b332-f840ea708565', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Configuration Params for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('02b2ecdf-fc92-4d19-b332-f840ea708565', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Prompt Models */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ad4d32ae-6848-41a0-a966-2a1f8b751251',
         'MJ: AI Prompt Models',
         NULL,
         NULL,
         'AIPromptModel',
         'vwAIPromptModels',
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
   

/* SQL generated to add new entity MJ: AI Prompt Models to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ad4d32ae-6848-41a0-a966-2a1f8b751251', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Prompt Models for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ad4d32ae-6848-41a0-a966-2a1f8b751251', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Prompt Models for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ad4d32ae-6848-41a0-a966-2a1f8b751251', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Prompt Models for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ad4d32ae-6848-41a0-a966-2a1f8b751251', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Agent Prompts */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '094cd426-12ff-4b26-a94b-9ac23c5829a0',
         'MJ: AI Agent Prompts',
         NULL,
         NULL,
         'AIAgentPrompt',
         'vwAIAgentPrompts',
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
   

/* SQL generated to add new entity MJ: AI Agent Prompts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '094cd426-12ff-4b26-a94b-9ac23c5829a0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Prompts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('094cd426-12ff-4b26-a94b-9ac23c5829a0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Prompts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('094cd426-12ff-4b26-a94b-9ac23c5829a0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Prompts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('094cd426-12ff-4b26-a94b-9ac23c5829a0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIVendor] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIVendor] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[AIConfiguration] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPromptModel */
ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPromptModel */
ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIVendorTypeDefinition */
ALTER TABLE [${flyway:defaultSchema}].[AIVendorTypeDefinition] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIVendorTypeDefinition */
ALTER TABLE [${flyway:defaultSchema}].[AIVendorTypeDefinition] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIVendorType */
ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIVendorType */
ALTER TABLE [${flyway:defaultSchema}].[AIVendorType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentPrompt */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentPrompt */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPrompt] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIConfigurationParam */
ALTER TABLE [${flyway:defaultSchema}].[AIConfigurationParam] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIConfigurationParam */
ALTER TABLE [${flyway:defaultSchema}].[AIConfigurationParam] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '61614107-0e81-476e-8b31-28fe9fb69a10'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'ID')
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
            '61614107-0e81-476e-8b31-28fe9fb69a10',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            1,
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
         WHERE ID = '332576c8-11ed-4b64-89f8-69fd99004712'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'Name')
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
            '332576c8-11ed-4b64-89f8-69fd99004712',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            2,
            'Name',
            'Name',
            'The unique name of the vendor.',
            'nvarchar',
            100,
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
         WHERE ID = '0e0a4b47-0994-4b52-9dac-e1d8494d353e'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'Description')
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
            '0e0a4b47-0994-4b52-9dac-e1d8494d353e',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            3,
            'Description',
            'Description',
            'Detailed description of the vendor and their AI offerings.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '15b68af6-ea7f-424b-bd0b-a4b9ccec5aee'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = '__mj_CreatedAt')
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
            '15b68af6-ea7f-424b-bd0b-a4b9ccec5aee',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            4,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ecd4b59b-e668-48fb-990b-2ca1f19d667b'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = '__mj_UpdatedAt')
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
            'ecd4b59b-e668-48fb-990b-2ca1f19d667b',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            5,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '88e41cb0-f013-4493-8cef-5145918ac6d7'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'ID')
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
            '88e41cb0-f013-4493-8cef-5145918ac6d7',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            1,
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
         WHERE ID = '25c9e89a-f411-4205-a031-e0a8c35e63bd'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'Name')
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
            '25c9e89a-f411-4205-a031-e0a8c35e63bd',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            2,
            'Name',
            'Name',
            'The name of the configuration.',
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
         WHERE ID = 'd0caf45e-4b1b-4bb6-80b7-a49631af0f96'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'Description')
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
            'd0caf45e-4b1b-4bb6-80b7-a49631af0f96',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            3,
            'Description',
            'Description',
            'Detailed description of the configuration.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5516dae6-ef96-411c-b7aa-9c20b9006577'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'IsDefault')
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
            '5516dae6-ef96-411c-b7aa-9c20b9006577',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            4,
            'IsDefault',
            'Is Default',
            'Indicates whether this is the default configuration to use when none is specified.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f885f179-dfa5-4b9a-bdb6-6bfb0dc90601'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'Status')
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
            'f885f179-dfa5-4b9a-bdb6-6bfb0dc90601',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            5,
            'Status',
            'Status',
            'The current status of the configuration. Values include Active, Inactive, Deprecated, and Preview.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7c9c04c8-4778-48d6-a1be-d85d8381dc4b'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultPromptForContextCompressionID')
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
            '7c9c04c8-4778-48d6-a1be-d85d8381dc4b',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            6,
            'DefaultPromptForContextCompressionID',
            'Default Prompt For Context Compression ID',
            'Default prompt to use for context compression when not specified at the agent level.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
         WHERE ID = '6686738d-6185-4899-aed0-2295f02d5f75'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultPromptForContextSummarizationID')
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
            '6686738d-6185-4899-aed0-2295f02d5f75',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            7,
            'DefaultPromptForContextSummarizationID',
            'Default Prompt For Context Summarization ID',
            'Default prompt to use for context summarization when not specified at the agent level.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
         WHERE ID = '18266a8c-dfee-4658-99c6-9b8d49667f27'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = '__mj_CreatedAt')
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
            '18266a8c-dfee-4658-99c6-9b8d49667f27',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            8,
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
         WHERE ID = '484d0280-c551-4a7b-a0ea-adf3a098dfd0'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = '__mj_UpdatedAt')
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
            '484d0280-c551-4a7b-a0ea-adf3a098dfd0',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            9,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a6f8773f-4021-45dd-b142-9bfe4f67ec87'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ParentID')
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
            'a6f8773f-4021-45dd-b142-9bfe4f67ec87',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            7,
            'ParentID',
            'Parent ID',
            'References the parent agent in the hierarchical structure. If NULL, this is a root (top-level) agent.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'df61ac7c-79a7-4058-96a1-85eba9339d45'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ExposeAsAction')
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
            'df61ac7c-79a7-4058-96a1-85eba9339d45',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            8,
            'ExposeAsAction',
            'Expose As Action',
            'When true, this agent can be exposed as an action for use by other agents. Only valid for root agents.',
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
         WHERE ID = '090830ce-4073-486c-bbf2-e2105beadd91'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ExecutionOrder')
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
            '090830ce-4073-486c-bbf2-e2105beadd91',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            9,
            'ExecutionOrder',
            'Execution Order',
            'The order in which this agent should be executed among its siblings under the same parent.',
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
         WHERE ID = '8261d630-2560-4c03-be14-c8a9682abbb4'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ExecutionMode')
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
            '8261d630-2560-4c03-be14-c8a9682abbb4',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            10,
            'ExecutionMode',
            'Execution Mode',
            'Controls how this agent''s child agents are executed. Sequential runs children in order, Parallel runs them simultaneously.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Sequential',
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
         WHERE ID = '09afe563-63e3-4f2b-b6f1-5945432ff07b'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'EnableContextCompression')
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
            '09afe563-63e3-4f2b-b6f1-5945432ff07b',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            11,
            'EnableContextCompression',
            'Enable Context Compression',
            'When true, enables automatic compression of conversation context when the message threshold is reached.',
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
         WHERE ID = '451d5c8f-6749-4789-a158-658b38a74ae4'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ContextCompressionMessageThreshold')
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
            '451d5c8f-6749-4789-a158-658b38a74ae4',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            12,
            'ContextCompressionMessageThreshold',
            'Context Compression Message Threshold',
            'Number of messages that triggers context compression when EnableContextCompression is true.',
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
         WHERE ID = 'ffd209c5-48f3-45d1-9094-e76ec832ea07'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ContextCompressionPromptID')
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
            'ffd209c5-48f3-45d1-9094-e76ec832ea07',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            13,
            'ContextCompressionPromptID',
            'Context Compression Prompt ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
         WHERE ID = '73a50d68-976f-49a7-9737-12d1d26c6011'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ContextCompressionMessageRetentionCount')
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
            '73a50d68-976f-49a7-9737-12d1d26c6011',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            14,
            'ContextCompressionMessageRetentionCount',
            'Context Compression Message Retention Count',
            'Number of recent messages to keep uncompressed when context compression is applied.',
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
         WHERE ID = 'fa463bba-b763-48cb-a6f8-f0a3b5afa35d'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ID')
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
            'fa463bba-b763-48cb-a6f8-f0a3b5afa35d',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            1,
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
         WHERE ID = 'b2cc3bf9-108b-4703-97a1-6e477ed9d8a9'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'PromptID')
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
            'b2cc3bf9-108b-4703-97a1-6e477ed9d8a9',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            2,
            'PromptID',
            'Prompt ID',
            'References the AI prompt this model association applies to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '10370467-1ccd-4a86-af3f-39be67b19b99'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ModelID')
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
            '10370467-1ccd-4a86-af3f-39be67b19b99',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            3,
            'ModelID',
            'Model ID',
            'References the AI model to use for this prompt.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd7cd881d-840d-4a68-bcda-2203e74e62a5'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'VendorID')
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
            'd7cd881d-840d-4a68-bcda-2203e74e62a5',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            4,
            'VendorID',
            'Vendor ID',
            'Optional reference to a specific vendor for the model. If NULL, uses the highest priority vendor for the model.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ee922f4a-d61d-4222-8c7f-7fea211addc9'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ConfigurationID')
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
            'ee922f4a-d61d-4222-8c7f-7fea211addc9',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            5,
            'ConfigurationID',
            'Configuration ID',
            'Optional reference to a specific configuration. If NULL, this model is available in all configurations.',
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4b8e1299-e3bf-4838-9d0f-a01f6883c063'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Priority')
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
            '4b8e1299-e3bf-4838-9d0f-a01f6883c063',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            6,
            'Priority',
            'Priority',
            'Priority of this model for the prompt. Higher values indicate higher priority.',
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
         WHERE ID = '29f49b56-b2f7-4d8b-9f4e-10713d61819c'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ExecutionGroup')
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
            '29f49b56-b2f7-4d8b-9f4e-10713d61819c',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            7,
            'ExecutionGroup',
            'Execution Group',
            'Execution group for parallel processing. Models with the same group are executed in parallel.',
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
         WHERE ID = 'b64439f2-b243-4b96-bb4c-c09c5dbd760f'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ModelParameters')
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
            'b64439f2-b243-4b96-bb4c-c09c5dbd760f',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            8,
            'ModelParameters',
            'Model Parameters',
            'JSON-formatted parameters specific to this model (temperature, max tokens, etc.).',
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
         WHERE ID = '70e7ff76-a99f-4886-ae7c-3de0c620b4a5'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Status')
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
            '70e7ff76-a99f-4886-ae7c-3de0c620b4a5',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            9,
            'Status',
            'Status',
            'The current status of this model configuration. Values include Active, Inactive, Deprecated, and Preview.',
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
         WHERE ID = 'fec78d56-641a-4866-9049-2f3684df4592'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ParallelizationMode')
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
            'fec78d56-641a-4866-9049-2f3684df4592',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            10,
            'ParallelizationMode',
            'Parallelization Mode',
            'Controls how this model participates in parallelization: None, StaticCount, or ConfigParam.',
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
         WHERE ID = 'cccefdb1-e3b9-4a2f-821f-e2cb010bb237'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ParallelCount')
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
            'cccefdb1-e3b9-4a2f-821f-e2cb010bb237',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            11,
            'ParallelCount',
            'Parallel Count',
            'Number of parallel executions to perform with this model when ParallelizationMode is StaticCount.',
            'int',
            4,
            10,
            0,
            0,
            '(1)',
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
         WHERE ID = 'c856bfac-6211-4573-8a75-861dac5e37e1'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'ParallelConfigParam')
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
            'c856bfac-6211-4573-8a75-861dac5e37e1',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            12,
            'ParallelConfigParam',
            'Parallel Config Param',
            'Name of a configuration parameter that contains the parallel count when ParallelizationMode is ConfigParam.',
            'nvarchar',
            200,
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
         WHERE ID = '4a75d65e-d43b-4879-95a9-72ab39bcd88e'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = '__mj_CreatedAt')
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
            '4a75d65e-d43b-4879-95a9-72ab39bcd88e',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            13,
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
         WHERE ID = 'fffbadaf-d742-4866-8103-6615dbc43fe0'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = '__mj_UpdatedAt')
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
            'fffbadaf-d742-4866-8103-6615dbc43fe0',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            14,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cda86cd9-be45-45be-8d10-643f8f1edaad'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'AIModelTypeID')
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
            'cda86cd9-be45-45be-8d10-643f8f1edaad',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            12,
            'AIModelTypeID',
            'AI Model Type ID',
            'References the type of AI model this prompt is designed for (LLM, Image, Audio, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '01248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '351f6694-a797-4177-a8dd-9ea4cb2facbc'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'MinPowerRank')
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
            '351f6694-a797-4177-a8dd-9ea4cb2facbc',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            13,
            'MinPowerRank',
            'Min Power Rank',
            'The minimum power rank required for models to be considered for this prompt.',
            'int',
            4,
            10,
            0,
            1,
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
         WHERE ID = 'a014de78-5fb6-4114-ac50-40739a24e122'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'SelectionStrategy')
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
            'a014de78-5fb6-4114-ac50-40739a24e122',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            14,
            'SelectionStrategy',
            'Selection Strategy',
            'Determines how models are selected for this prompt (Default, Specific, ByPower).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Default',
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
         WHERE ID = '3a0fd2b4-c4db-4e4b-b971-1c0f319dfa5a'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PowerPreference')
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
            '3a0fd2b4-c4db-4e4b-b971-1c0f319dfa5a',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            15,
            'PowerPreference',
            'Power Preference',
            'When using ByPower selection strategy, determines whether to prefer highest, lowest, or balanced power models.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Highest',
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
         WHERE ID = 'a93c0cbb-a329-4e92-90d8-471ff627d055'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ParallelizationMode')
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
            'a93c0cbb-a329-4e92-90d8-471ff627d055',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            16,
            'ParallelizationMode',
            'Parallelization Mode',
            'Controls parallelization: None (no parallelization), StaticCount (use AIPrompt.ParallelCount for total runs), ConfigParam (use config param specified in ParallelConfigParam for total runs), or ModelSpecific (check each AIPromptModel''s individual settings).',
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
         WHERE ID = '4c01fb80-4497-4547-b0aa-411163649a40'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ParallelCount')
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
            '4c01fb80-4497-4547-b0aa-411163649a40',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            17,
            'ParallelCount',
            'Parallel Count',
            'When ParallelizationMode is StaticCount, specifies the number of parallel executions.',
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
         WHERE ID = 'b44041fc-9647-4a7d-a985-e2a22a733e26'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ParallelConfigParam')
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
            'b44041fc-9647-4a7d-a985-e2a22a733e26',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            18,
            'ParallelConfigParam',
            'Parallel Config Param',
            'When ParallelizationMode is ConfigParam, specifies the name of the configuration parameter that contains the parallel count.',
            'nvarchar',
            200,
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
         WHERE ID = '45f16173-581a-4383-bcba-61538c5747d6'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'OutputType')
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
            '45f16173-581a-4383-bcba-61538c5747d6',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            19,
            'OutputType',
            'Output Type',
            'The expected data type of the prompt output: string, number, boolean, date, or object.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'string',
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
         WHERE ID = 'd23659b1-735a-4943-8bca-3c6827f576dc'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'OutputExample')
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
            'd23659b1-735a-4943-8bca-3c6827f576dc',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            20,
            'OutputExample',
            'Output Example',
            'JSON example output when OutputType is "object", used for validating structured outputs.',
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
         WHERE ID = '2a15842a-b85b-450f-acd2-65e3df0b29f2'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ValidationBehavior')
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
            '2a15842a-b85b-450f-acd2-65e3df0b29f2',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            21,
            'ValidationBehavior',
            'Validation Behavior',
            'Determines how validation failures are handled: Strict (fail), Warn (log warning), or None (ignore).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Warn',
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
         WHERE ID = 'b651f87e-4f28-4076-987f-d62e0976377f'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'MaxRetries')
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
            'b651f87e-4f28-4076-987f-d62e0976377f',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            22,
            'MaxRetries',
            'Max Retries',
            'Maximum number of retry attempts for API failures.',
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
         WHERE ID = 'c5605bda-0e1e-4f0d-b12b-6851a6b048f8'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'RetryDelayMS')
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
            'c5605bda-0e1e-4f0d-b12b-6851a6b048f8',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            23,
            'RetryDelayMS',
            'Retry Delay MS',
            'Delay between retry attempts in milliseconds.',
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
         WHERE ID = '0049ee44-5535-4d29-9ce2-2522e5bcd811'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'RetryStrategy')
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
            '0049ee44-5535-4d29-9ce2-2522e5bcd811',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            24,
            'RetryStrategy',
            'Retry Strategy',
            'Strategy for calculating retry delays: Fixed (same delay each time), Exponential (doubling delay), or Linear (linearly increasing delay).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Fixed',
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
         WHERE ID = 'cb91de8e-b02c-42dd-9252-44d3905a5b9e'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ResultSelectorPromptID')
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
            'cb91de8e-b02c-42dd-9252-44d3905a5b9e',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            25,
            'ResultSelectorPromptID',
            'Result Selector Prompt ID',
            'References another prompt that selects the best result from multiple parallel executions.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
         WHERE ID = '758d2c13-2ce3-466a-9fbd-cbe8a2691dfe'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'EnableCaching')
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
            '758d2c13-2ce3-466a-9fbd-cbe8a2691dfe',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            26,
            'EnableCaching',
            'Enable Caching',
            'When true, results from this prompt will be cached for potential reuse.',
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
         WHERE ID = '32fc4550-a54f-453a-9855-65760ad3c4a8'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheTTLSeconds')
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
            '32fc4550-a54f-453a-9855-65760ad3c4a8',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            27,
            'CacheTTLSeconds',
            'Cache TTL Seconds',
            'Time-to-live in seconds for cached results. NULL means results never expire.',
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
         WHERE ID = 'b007d2d5-549e-4688-b48d-8edd2c5075d4'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheMatchType')
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
            'b007d2d5-549e-4688-b48d-8edd2c5075d4',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            28,
            'CacheMatchType',
            'Cache Match Type',
            'Method for matching cached results: Exact (string matching) or Vector (embedding similarity).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Exact',
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
         WHERE ID = 'f8c70016-d404-4d8f-bbfb-f36d62cd1fe3'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheSimilarityThreshold')
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
            'f8c70016-d404-4d8f-bbfb-f36d62cd1fe3',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            29,
            'CacheSimilarityThreshold',
            'Cache Similarity Threshold',
            'Threshold (0-1) for vector similarity matching. Higher values require closer matches.',
            'float',
            8,
            53,
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
         WHERE ID = '8dfdf996-6cb2-4943-be6b-329ab6f36576'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheMustMatchModel')
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
            '8dfdf996-6cb2-4943-be6b-329ab6f36576',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            30,
            'CacheMustMatchModel',
            'Cache Must Match Model',
            'When true, the AI model must match for a cache hit. When false, results from any model can be used.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = '0a990225-81cb-4355-909e-bc018eabdbd7'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheMustMatchVendor')
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
            '0a990225-81cb-4355-909e-bc018eabdbd7',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            31,
            'CacheMustMatchVendor',
            'Cache Must Match Vendor',
            'When true, the vendor must match for a cache hit. When false, results from any vendor can be used.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = '45e6fc9c-7ecd-42d9-aa6a-cdefbdc97f26'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheMustMatchAgent')
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
            '45e6fc9c-7ecd-42d9-aa6a-cdefbdc97f26',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            32,
            'CacheMustMatchAgent',
            'Cache Must Match Agent',
            'When true, the agent context must match for a cache hit. When false, agent-specific and non-agent results can be used interchangeably.',
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
         WHERE ID = '2861d3b4-040e-48d0-907e-c42ed42bd3ab'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'CacheMustMatchConfig')
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
            '2861d3b4-040e-48d0-907e-c42ed42bd3ab',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            33,
            'CacheMustMatchConfig',
            'Cache Must Match Config',
            'When true, the configuration must match for a cache hit. When false, results from any configuration can be used.',
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
         WHERE ID = 'f332d3a9-5402-4e82-90e4-ddb3f4315f19'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'VendorID')
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
            'f332d3a9-5402-4e82-90e4-ddb3f4315f19',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            11,
            'VendorID',
            'Vendor ID',
            'The vendor that provided this result.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
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
         WHERE ID = '257026b1-1fd2-4b71-b94d-f97e7fee6023'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'AgentID')
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
            '257026b1-1fd2-4b71-b94d-f97e7fee6023',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            12,
            'AgentID',
            'Agent ID',
            'The agent that initiated the request, if any.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4d991b48-52bd-4609-b8c1-71529bf8e9e8'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ConfigurationID')
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
            '4d991b48-52bd-4609-b8c1-71529bf8e9e8',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            13,
            'ConfigurationID',
            'Configuration ID',
            'The configuration used for this execution.',
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
         WHERE ID = 'c20c752b-8050-44a3-bc08-c1e85e1a9231'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptEmbedding')
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
            'c20c752b-8050-44a3-bc08-c1e85e1a9231',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            14,
            'PromptEmbedding',
            'Prompt Embedding',
            'Vector representation of the prompt for similarity matching.',
            'varbinary',
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
         WHERE ID = '1bf0daad-4f43-4486-af6a-787a9dd73684'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRunID')
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
            '1bf0daad-4f43-4486-af6a-787a9dd73684',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            15,
            'PromptRunID',
            'Prompt Run ID',
            'Reference to the AIPromptRun that created this cache entry.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
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
         WHERE ID = '07ad23d5-debd-4657-8e3c-7f1f1342bce3'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCodeName')
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
            '07ad23d5-debd-4657-8e3c-7f1f1342bce3',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            44,
            'FieldCodeName',
            'Field Code Name',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = 'fcff872d-0b33-4c53-bb9f-15910f91ad83'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SchemaAutoAddNewEntities')
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
            'fcff872d-0b33-4c53-bb9f-15910f91ad83',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            8,
            'SchemaAutoAddNewEntities',
            'Schema Auto Add New Entities',
            'Comma-delimited list of schema names where entities will be automatically added to the application when created in those schemas',
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4536a71e-5ad6-4f8c-a663-21f3cef4831a'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'ID')
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
            '4536a71e-5ad6-4f8c-a663-21f3cef4831a',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            1,
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
         WHERE ID = 'c7583b81-0bc4-4302-98ed-be6e5dd22d50'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'ModelID')
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
            'c7583b81-0bc4-4302-98ed-be6e5dd22d50',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            2,
            'ModelID',
            'Model ID',
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
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b30005ce-fa92-4dee-8f56-befc7d5e2aae'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'VendorID')
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
            'b30005ce-fa92-4dee-8f56-befc7d5e2aae',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            3,
            'VendorID',
            'Vendor ID',
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
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '37bfe134-5935-4863-8b22-29efe58b2150'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'Priority')
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
            '37bfe134-5935-4863-8b22-29efe58b2150',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            4,
            'Priority',
            'Priority',
            'Determines the priority rank of this vendor for the model. Higher values indicate higher priority.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1b9f8d2c-f8b4-45d1-b45c-2e946b0c9429'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'Status')
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
            '1b9f8d2c-f8b4-45d1-b45c-2e946b0c9429',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            5,
            'Status',
            'Status',
            'The current status of this model-vendor combination. Values include Active, Inactive, Deprecated, and Preview.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bf1b7891-03fe-4b11-abe7-4bdf4c832a56'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'DriverClass')
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
            'bf1b7891-03fe-4b11-abe7-4bdf4c832a56',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            6,
            'DriverClass',
            'Driver Class',
            'The name of the driver class implementing this model-vendor combination.',
            'nvarchar',
            200,
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
         WHERE ID = 'd57079f0-0de2-45d8-8ecb-4dc006888664'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'DriverImportPath')
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
            'd57079f0-0de2-45d8-8ecb-4dc006888664',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            7,
            'DriverImportPath',
            'Driver Import Path',
            'The import path for the driver class.',
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
         WHERE ID = 'fbee7ec7-7ad6-45d1-874b-caae97c51b22'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'APIName')
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
            'fbee7ec7-7ad6-45d1-874b-caae97c51b22',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            8,
            'APIName',
            'API Name',
            'The name of the model to use with API calls, which might differ from the model name. If not provided, the model name will be used.',
            'nvarchar',
            200,
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
         WHERE ID = '20e5affe-1f52-478d-ad83-c5a0a90a2c4e'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'MaxInputTokens')
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
            '20e5affe-1f52-478d-ad83-c5a0a90a2c4e',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            9,
            'MaxInputTokens',
            'Max Input Tokens',
            'The maximum number of input tokens supported by this model-vendor implementation.',
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
         WHERE ID = 'c5799595-5330-4762-bd3c-12f9cd02e933'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'MaxOutputTokens')
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
            'c5799595-5330-4762-bd3c-12f9cd02e933',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            10,
            'MaxOutputTokens',
            'Max Output Tokens',
            'The maximum number of output tokens supported by this model-vendor implementation.',
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
         WHERE ID = '1099a0de-eee4-4d04-b0f6-ac9ed896690d'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'SupportedResponseFormats')
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
            '1099a0de-eee4-4d04-b0f6-ac9ed896690d',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            11,
            'SupportedResponseFormats',
            'Supported Response Formats',
            'A comma-delimited string indicating the supported response formats for this model-vendor implementation. Options include Any, Text, Markdown, JSON, and ModelSpecific.',
            'nvarchar',
            200,
            0,
            0,
            0,
            'Any',
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
         WHERE ID = 'b36b3620-899f-4851-ad2a-ed14f2d22a4c'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'SupportsEffortLevel')
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
            'b36b3620-899f-4851-ad2a-ed14f2d22a4c',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            12,
            'SupportsEffortLevel',
            'Supports Effort Level',
            'Specifies if this model-vendor implementation supports the concept of an effort level.',
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
         WHERE ID = '2e9da543-3a02-4695-a96c-3017025842ce'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'SupportsStreaming')
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
            '2e9da543-3a02-4695-a96c-3017025842ce',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            13,
            'SupportsStreaming',
            'Supports Streaming',
            'Specifies if this model-vendor implementation supports streaming responses.',
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
         WHERE ID = 'c8ea3975-296e-4432-a2cf-78ba773f7cd0'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = '__mj_CreatedAt')
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
            'c8ea3975-296e-4432-a2cf-78ba773f7cd0',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            14,
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
         WHERE ID = '0199799b-8d89-4306-aa33-67d7a326165a'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = '__mj_UpdatedAt')
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
            '0199799b-8d89-4306-aa33-67d7a326165a',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            15,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c56a7275-94a7-498a-ac60-d6de8b02d7cd'  OR 
               (EntityID = 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1' AND Name = 'ID')
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
            'c56a7275-94a7-498a-ac60-d6de8b02d7cd',
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', -- Entity: MJ: AI Vendor Type Definitions
            1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
         WHERE ID = 'c0008a9d-1385-41d0-b298-53eddab7e16e'  OR 
               (EntityID = 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1' AND Name = 'Name')
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
            'c0008a9d-1385-41d0-b298-53eddab7e16e',
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', -- Entity: MJ: AI Vendor Type Definitions
            2,
            'Name',
            'Name',
            'The name of the vendor type.',
            'nvarchar',
            100,
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
         WHERE ID = 'd9a68bd5-5666-4a3b-ae26-1ad51d691362'  OR 
               (EntityID = 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1' AND Name = 'Description')
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
            'd9a68bd5-5666-4a3b-ae26-1ad51d691362',
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', -- Entity: MJ: AI Vendor Type Definitions
            3,
            'Description',
            'Description',
            'Detailed description of the vendor type.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '829e40af-4dcc-4a74-a25a-160fe0a611d7'  OR 
               (EntityID = 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1' AND Name = '__mj_CreatedAt')
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
            '829e40af-4dcc-4a74-a25a-160fe0a611d7',
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', -- Entity: MJ: AI Vendor Type Definitions
            4,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e7169af7-1ae2-4adc-aa8c-c42f3a2054a3'  OR 
               (EntityID = 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1' AND Name = '__mj_UpdatedAt')
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
            'e7169af7-1ae2-4adc-aa8c-c42f3a2054a3',
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', -- Entity: MJ: AI Vendor Type Definitions
            5,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e8a0e21b-718e-43e7-b690-3d8a22480c30'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'ID')
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
            'e8a0e21b-718e-43e7-b690-3d8a22480c30',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            1,
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
         WHERE ID = '5e4e4059-4879-49c3-8bec-61864b15d90b'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'VendorID')
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
            '5e4e4059-4879-49c3-8bec-61864b15d90b',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            2,
            'VendorID',
            'Vendor ID',
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
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eabe64e2-71e0-446a-9743-7d602d7eb36b'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'TypeID')
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
            'eabe64e2-71e0-446a-9743-7d602d7eb36b',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            3,
            'TypeID',
            'Type ID',
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
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd12e9415-e8a3-45fc-9a16-7edbe04c9f79'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'Rank')
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
            'd12e9415-e8a3-45fc-9a16-7edbe04c9f79',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            4,
            'Rank',
            'Rank',
            'Determines the priority rank of this type for the vendor. Higher values indicate higher priority.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f928e66c-7fa4-46b7-a08c-db1784b52f58'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'Status')
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
            'f928e66c-7fa4-46b7-a08c-db1784b52f58',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            5,
            'Status',
            'Status',
            'The current status of this vendor type. Values include Active, Inactive, Deprecated, and Preview.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '486f3297-0e45-4ab5-a7c1-34f5dc558bd1'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = '__mj_CreatedAt')
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
            '486f3297-0e45-4ab5-a7c1-34f5dc558bd1',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            6,
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
         WHERE ID = '1c379b4f-73ab-43e8-8182-d83c825db959'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = '__mj_UpdatedAt')
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
            '1c379b4f-73ab-43e8-8182-d83c825db959',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4cae2062-35e7-4f81-9163-c6b0c7334623'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'ID')
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
            '4cae2062-35e7-4f81-9163-c6b0c7334623',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            1,
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
         WHERE ID = '4ad38ea9-178a-4e9e-be99-3856111947ee'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'AgentID')
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
            '4ad38ea9-178a-4e9e-be99-3856111947ee',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            2,
            'AgentID',
            'Agent ID',
            'References the agent this prompt is associated with.',
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f304b5ea-2c56-45ee-ae0c-6ec0f0d219b6'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'PromptID')
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
            'f304b5ea-2c56-45ee-ae0c-6ec0f0d219b6',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            3,
            'PromptID',
            'Prompt ID',
            'References the prompt to be used by the agent.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'be65ab16-d91d-4c2e-bc8c-ec76f06eeb1c'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'Purpose')
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
            'be65ab16-d91d-4c2e-bc8c-ec76f06eeb1c',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            4,
            'Purpose',
            'Purpose',
            'The functional purpose of this prompt within the agent, such as "Initialize", "ProcessData", or "Summarize".',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '17470b17-bdc5-48b6-b922-7eac9492fcfd'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'ExecutionOrder')
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
            '17470b17-bdc5-48b6-b922-7eac9492fcfd',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            5,
            'ExecutionOrder',
            'Execution Order',
            'The sequence order in which this prompt should be executed within the agent''s workflow.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '835a1fb1-9184-4ec8-b823-8960fe07545e'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'ConfigurationID')
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
            '835a1fb1-9184-4ec8-b823-8960fe07545e',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            6,
            'ConfigurationID',
            'Configuration ID',
            'Optional reference to a specific configuration to use for this prompt. If NULL, uses the default configuration.',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '87c999ed-988e-4d22-affd-0480cb334de1'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'Status')
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
            '87c999ed-988e-4d22-affd-0480cb334de1',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            7,
            'Status',
            'Status',
            'The current status of this agent-prompt mapping. Values include Active, Inactive, Deprecated, and Preview.',
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
         WHERE ID = 'd247b728-8ae9-405d-bb8b-5240afeec03d'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'ContextBehavior')
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
            'd247b728-8ae9-405d-bb8b-5240afeec03d',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            8,
            'ContextBehavior',
            'Context Behavior',
            'Determines how conversation context is filtered for this prompt: Complete, Smart, None, RecentMessages, InitialMessages, or Custom.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Complete',
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
         WHERE ID = 'e51aae07-da07-4781-b5f8-0d8947969cdb'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'ContextMessageCount')
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
            'e51aae07-da07-4781-b5f8-0d8947969cdb',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            9,
            'ContextMessageCount',
            'Context Message Count',
            'The number of messages to include when ContextBehavior is set to RecentMessages or InitialMessages.',
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
         WHERE ID = '26b1d691-14b3-4689-a084-a39ed28eae25'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = '__mj_CreatedAt')
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
            '26b1d691-14b3-4689-a084-a39ed28eae25',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            10,
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
         WHERE ID = '764b9992-b92c-4ed0-8d78-9ea79fc1de75'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = '__mj_UpdatedAt')
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
            '764b9992-b92c-4ed0-8d78-9ea79fc1de75',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            11,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bb1a9efa-52a5-4d39-a67b-0c623c037ea8'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ID')
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
            'bb1a9efa-52a5-4d39-a67b-0c623c037ea8',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            1,
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
         WHERE ID = '9407cd9f-eb55-4bb5-8cdd-5d2e70d9d739'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'PromptID')
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
            '9407cd9f-eb55-4bb5-8cdd-5d2e70d9d739',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            2,
            'PromptID',
            'Prompt ID',
            'The prompt that was executed.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '71548843-faaa-493f-a7d3-fdcb4a3a80df'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ModelID')
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
            '71548843-faaa-493f-a7d3-fdcb4a3a80df',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            3,
            'ModelID',
            'Model ID',
            'The AI model used for execution.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f4e86c22-d315-4db1-9da1-a5779b78eaac'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'VendorID')
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
            'f4e86c22-d315-4db1-9da1-a5779b78eaac',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            4,
            'VendorID',
            'Vendor ID',
            'The vendor providing the model/inference.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c1d2ec52-e3de-46e1-a7b7-c353c811e74c'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'AgentID')
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
            'c1d2ec52-e3de-46e1-a7b7-c353c811e74c',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            5,
            'AgentID',
            'Agent ID',
            'If this prompt was run as part of an agent, references the agent.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fe9c78cb-14f9-4f2d-85a1-51860e35c95b'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ConfigurationID')
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
            'fe9c78cb-14f9-4f2d-85a1-51860e35c95b',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            6,
            'ConfigurationID',
            'Configuration ID',
            'Optional configuration used for this execution.',
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
         WHERE ID = '403ebb3c-a506-4a45-807c-28b5be669837'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'RunAt')
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
            '403ebb3c-a506-4a45-807c-28b5be669837',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            7,
            'RunAt',
            'Run At',
            'When the prompt execution started.',
            'datetime2',
            8,
            27,
            7,
            0,
            'getutcdate()',
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
         WHERE ID = 'c292566b-aeb6-495c-b228-97f4509e159f'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'CompletedAt')
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
            'c292566b-aeb6-495c-b228-97f4509e159f',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            8,
            'CompletedAt',
            'Completed At',
            'When the prompt execution finished. NULL indicates a pending or interrupted execution.',
            'datetime2',
            8,
            27,
            7,
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
         WHERE ID = '6c2e9d77-1a55-40b2-a6b5-b385bb95c14f'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ExecutionTimeMS')
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
            '6c2e9d77-1a55-40b2-a6b5-b385bb95c14f',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            9,
            'ExecutionTimeMS',
            'Execution Time MS',
            'Total execution time in milliseconds.',
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
         WHERE ID = 'a863f3d6-18e5-4fbd-b498-bc74bb6c7592'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Messages')
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
            'a863f3d6-18e5-4fbd-b498-bc74bb6c7592',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            10,
            'Messages',
            'Messages',
            'The input messages sent to the model, typically in JSON format.',
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
         WHERE ID = 'd3c9bc7e-8fda-4cc9-a6af-f928183ed4ec'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Result')
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
            'd3c9bc7e-8fda-4cc9-a6af-f928183ed4ec',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            11,
            'Result',
            'Result',
            'The output result from the model.',
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
         WHERE ID = '8eb9eb12-02c0-4d19-bc14-0dc706c9ee58'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensUsed')
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
            '8eb9eb12-02c0-4d19-bc14-0dc706c9ee58',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            12,
            'TokensUsed',
            'Tokens Used',
            'Total number of tokens used (prompt + completion).',
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
         WHERE ID = '82d0e001-0826-44bc-b394-0299dafbbb62'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensPrompt')
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
            '82d0e001-0826-44bc-b394-0299dafbbb62',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            13,
            'TokensPrompt',
            'Tokens Prompt',
            'Number of tokens in the prompt.',
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
         WHERE ID = '4f3c2e1e-2f65-4b98-82bb-cb48b6285546'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensCompletion')
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
            '4f3c2e1e-2f65-4b98-82bb-cb48b6285546',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            14,
            'TokensCompletion',
            'Tokens Completion',
            'Number of tokens in the completion/result.',
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
         WHERE ID = '74bcf682-06a6-4ddc-bf1e-c7b5601d715e'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TotalCost')
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
            '74bcf682-06a6-4ddc-bf1e-c7b5601d715e',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            15,
            'TotalCost',
            'Total Cost',
            'Estimated cost of this execution in USD.',
            'decimal',
            9,
            18,
            6,
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
         WHERE ID = '621dbfad-a8a3-4b94-9247-418f4b310fd2'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Success')
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
            '621dbfad-a8a3-4b94-9247-418f4b310fd2',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            16,
            'Success',
            'Success',
            'Whether the execution was successful.',
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
         WHERE ID = 'f9a3491b-ac3c-4cd2-bbc6-6cc0bcd674da'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ErrorMessage')
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
            'f9a3491b-ac3c-4cd2-bbc6-6cc0bcd674da',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            17,
            'ErrorMessage',
            'Error Message',
            'Error message if the execution failed.',
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
         WHERE ID = 'bafffcd7-77c9-4716-a0e2-60c41814ccc8'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = '__mj_CreatedAt')
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
            'bafffcd7-77c9-4716-a0e2-60c41814ccc8',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            18,
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
         WHERE ID = 'c32de832-7849-457c-9a45-5f9be3af68ce'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = '__mj_UpdatedAt')
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
            'c32de832-7849-457c-9a45-5f9be3af68ce',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            19,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8cacbb1e-7a2f-4aff-a621-f78af2651d08'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'ID')
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
            '8cacbb1e-7a2f-4aff-a621-f78af2651d08',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            1,
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
         WHERE ID = '9ceb2c06-16da-4d02-b575-499f97e9b2c6'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'ConfigurationID')
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
            '9ceb2c06-16da-4d02-b575-499f97e9b2c6',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            2,
            'ConfigurationID',
            'Configuration ID',
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
            '6AE1BBF0-2085-4D2F-B724-219DC4212026',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0f494d98-0bde-434c-94de-f680da51638c'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'Name')
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
            '0f494d98-0bde-434c-94de-f680da51638c',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            3,
            'Name',
            'Name',
            'The name of the configuration parameter.',
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
         WHERE ID = 'a68f157f-802a-433b-81a3-0b01ecc39c25'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'Type')
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
            'a68f157f-802a-433b-81a3-0b01ecc39c25',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            4,
            'Type',
            'Type',
            'The data type of the parameter (string, number, boolean, date, object).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'string',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4e06d3cf-e224-47db-951c-3e7af0dbec45'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'Value')
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
            '4e06d3cf-e224-47db-951c-3e7af0dbec45',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            5,
            'Value',
            'Value',
            'The value of the parameter, stored as a string but interpreted according to the Type.',
            'nvarchar',
            -1,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '15ac8e76-ce19-4cf8-988b-f6626d2ad27a'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'Description')
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
            '15ac8e76-ce19-4cf8-988b-f6626d2ad27a',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            6,
            'Description',
            'Description',
            'Detailed description of the parameter and its usage.',
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
         WHERE ID = '989267c8-3c01-4f86-9401-3a01aedd2862'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = '__mj_CreatedAt')
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
            '989267c8-3c01-4f86-9401-3a01aedd2862',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            7,
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
         WHERE ID = 'aa4d7327-75fe-46f4-9eb4-9d94d60901d0'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = '__mj_UpdatedAt')
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
            'aa4d7327-75fe-46f4-9eb4-9d94d60901d0',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            8,
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('87C999ED-988E-4D22-AFFD-0480CB334DE1', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('87C999ED-988E-4D22-AFFD-0480CB334DE1', 2, 'Inactive', 'Inactive')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('87C999ED-988E-4D22-AFFD-0480CB334DE1', 3, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('87C999ED-988E-4D22-AFFD-0480CB334DE1', 4, 'Preview', 'Preview')

/* SQL text to update ValueListType for entity field ID 87C999ED-988E-4D22-AFFD-0480CB334DE1 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='87C999ED-988E-4D22-AFFD-0480CB334DE1'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D247B728-8AE9-405D-BB8B-5240AFEEC03D', 1, 'Complete', 'Complete')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D247B728-8AE9-405D-BB8B-5240AFEEC03D', 2, 'Smart', 'Smart')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D247B728-8AE9-405D-BB8B-5240AFEEC03D', 3, 'None', 'None')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D247B728-8AE9-405D-BB8B-5240AFEEC03D', 4, 'RecentMessages', 'RecentMessages')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D247B728-8AE9-405D-BB8B-5240AFEEC03D', 5, 'InitialMessages', 'InitialMessages')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('D247B728-8AE9-405D-BB8B-5240AFEEC03D', 6, 'Custom', 'Custom')

/* SQL text to update ValueListType for entity field ID D247B728-8AE9-405D-BB8B-5240AFEEC03D */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D247B728-8AE9-405D-BB8B-5240AFEEC03D'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('45F16173-581A-4383-BCBA-61538C5747D6', 1, 'string', 'string')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('45F16173-581A-4383-BCBA-61538C5747D6', 2, 'number', 'number')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('45F16173-581A-4383-BCBA-61538C5747D6', 3, 'boolean', 'boolean')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('45F16173-581A-4383-BCBA-61538C5747D6', 4, 'date', 'date')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('45F16173-581A-4383-BCBA-61538C5747D6', 5, 'object', 'object')

/* SQL text to update ValueListType for entity field ID 45F16173-581A-4383-BCBA-61538C5747D6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='45F16173-581A-4383-BCBA-61538C5747D6'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2A15842A-B85B-450F-ACD2-65E3DF0B29F2', 1, 'Strict', 'Strict')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2A15842A-B85B-450F-ACD2-65E3DF0B29F2', 2, 'Warn', 'Warn')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2A15842A-B85B-450F-ACD2-65E3DF0B29F2', 3, 'None', 'None')

/* SQL text to update ValueListType for entity field ID 2A15842A-B85B-450F-ACD2-65E3DF0B29F2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2A15842A-B85B-450F-ACD2-65E3DF0B29F2'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a4b79aa1-afa5-4acc-87ae-1a0f312ed129'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a4b79aa1-afa5-4acc-87ae-1a0f312ed129', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'VendorID', 'One To Many', 1, 1, 'MJ: AI Prompt Models', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '15900cb6-9832-40e0-bc2d-354101848da9'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('15900cb6-9832-40e0-bc2d-354101848da9', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'VendorID', 'One To Many', 1, 1, 'AI Result Cache', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6d5e4a4b-6081-4f60-a830-acd0f2017a54'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6d5e4a4b-6081-4f60-a830-acd0f2017a54', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'VendorID', 'One To Many', 1, 1, 'MJ: AI Prompt Runs', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '07a008c3-cbe2-4ece-be14-7c03e4b09d58'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('07a008c3-cbe2-4ece-be14-7c03e4b09d58', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'VendorID', 'One To Many', 1, 1, 'MJ: AI Model Vendors', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a694b532-e5cb-4b1a-93d3-d830f73cb608'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a694b532-e5cb-4b1a-93d3-d830f73cb608', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', 'VendorID', 'One To Many', 1, 1, 'MJ: AI Vendor Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4db0f6aa-f897-4bb2-ba7a-b7adaf9e737c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4db0f6aa-f897-4bb2-ba7a-b7adaf9e737c', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ConfigurationID', 'One To Many', 1, 1, 'MJ: AI Prompt Runs', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '82826de1-c1c5-4906-833f-11decdbdc67f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('82826de1-c1c5-4906-833f-11decdbdc67f', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '02B2ECDF-FC92-4D19-B332-F840EA708565', 'ConfigurationID', 'One To Many', 1, 1, 'MJ: AI Configuration Params', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f6baf926-3722-4f1c-a5aa-a0cdf50a5db2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f6baf926-3722-4f1c-a5aa-a0cdf50a5db2', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '094CD426-12FF-4B26-A94B-9AC23C5829A0', 'ConfigurationID', 'One To Many', 1, 1, 'MJ: AI Agent Prompts', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'cfcc7871-0a32-4e47-ae66-4a9d73683314'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cfcc7871-0a32-4e47-ae66-4a9d73683314', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'ConfigurationID', 'One To Many', 1, 1, 'AI Result Cache', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9c07eef4-e185-461a-b0f7-041202be49d5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9c07eef4-e185-461a-b0f7-041202be49d5', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'ConfigurationID', 'One To Many', 1, 1, 'MJ: AI Prompt Models', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ea195d53-7cd1-40e7-9d3a-7cd9811dd47b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ea195d53-7cd1-40e7-9d3a-7cd9811dd47b', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'AgentID', 'One To Many', 1, 1, 'AI Result Cache', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '55045f0f-65d3-4936-98e1-fa3bc0be3f8e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('55045f0f-65d3-4936-98e1-fa3bc0be3f8e', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ParentID', 'One To Many', 1, 1, 'AI Agents', 6);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a22a1e7f-23c0-474a-bc5f-85464b7fe2c2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a22a1e7f-23c0-474a-bc5f-85464b7fe2c2', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '094CD426-12FF-4B26-A94B-9AC23C5829A0', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Prompts', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5e65c99b-c492-4024-a383-e9f133f20564'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5e65c99b-c492-4024-a383-e9f133f20564', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Prompt Runs', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b83ec5e5-fa9a-4f1f-8eb2-98b0550805bb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b83ec5e5-fa9a-4f1f-8eb2-98b0550805bb', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'PromptID', 'One To Many', 1, 1, 'MJ: AI Prompt Runs', 4);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a758fd57-c1ca-4b0e-8c8e-691ba70863ae'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a758fd57-c1ca-4b0e-8c8e-691ba70863ae', '73AD0238-8B56-EF11-991A-6045BDEBA539', '094CD426-12FF-4B26-A94B-9AC23C5829A0', 'PromptID', 'One To Many', 1, 1, 'MJ: AI Agent Prompts', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4bc01135-879a-4e45-a8c9-77895b135f68'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4bc01135-879a-4e45-a8c9-77895b135f68', '73AD0238-8B56-EF11-991A-6045BDEBA539', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'DefaultPromptForContextCompressionID', 'One To Many', 1, 1, 'MJ: AI Configurations', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e798f6ca-7eee-4c3d-8a3b-7e9855ebe05a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e798f6ca-7eee-4c3d-8a3b-7e9855ebe05a', '73AD0238-8B56-EF11-991A-6045BDEBA539', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'DefaultPromptForContextSummarizationID', 'One To Many', 1, 1, 'MJ: AI Configurations', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '25f0c897-4e46-430c-8b2e-76c3ca36b74c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('25f0c897-4e46-430c-8b2e-76c3ca36b74c', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ContextCompressionPromptID', 'One To Many', 1, 1, 'AI Agents', 7);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b88a7331-3014-4a4a-8034-077c1140dd88'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b88a7331-3014-4a4a-8034-077c1140dd88', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'PromptID', 'One To Many', 1, 1, 'MJ: AI Prompt Models', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4355c77d-6694-4067-999d-fd4c08d5ddb4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4355c77d-6694-4067-999d-fd4c08d5ddb4', '73AD0238-8B56-EF11-991A-6045BDEBA539', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'ResultSelectorPromptID', 'One To Many', 1, 1, 'AI Prompts', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'adb19a1f-ff06-49c3-a1f8-70d421da7d19'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('adb19a1f-ff06-49c3-a1f8-70d421da7d19', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'ModelID', 'One To Many', 1, 1, 'MJ: AI Prompt Models', 4);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a0d29d25-d361-456a-9a78-0479609ce30a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a0d29d25-d361-456a-9a78-0479609ce30a', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'ModelID', 'One To Many', 1, 1, 'MJ: AI Model Vendors', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '65f2c6f7-caee-4f10-a6a1-353899fecb9f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('65f2c6f7-caee-4f10-a6a1-353899fecb9f', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ModelID', 'One To Many', 1, 1, 'MJ: AI Prompt Runs', 5);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '06e9f3f0-d8e5-4f2b-a43c-20e10bb08e7f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('06e9f3f0-d8e5-4f2b-a43c-20e10bb08e7f', '01248F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'AIModelTypeID', 'One To Many', 1, 1, 'AI Prompts', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '96c1f875-9461-4f52-99ce-22e41451cbf7'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('96c1f875-9461-4f52-99ce-22e41451cbf7', 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', 'TypeID', 'One To Many', 1, 1, 'MJ: AI Vendor Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6217acc0-8ecc-4c4e-bfdc-00ca82153d82'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6217acc0-8ecc-4c4e-bfdc-00ca82153d82', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'PromptRunID', 'One To Many', 1, 1, 'AI Result Cache', 4);
   END
                              

/* Index for Foreign Keys for ScheduledActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ScheduledActionID in table ScheduledActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledActionParam_ScheduledActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledActionParam_ScheduledActionID ON [${flyway:defaultSchema}].[ScheduledActionParam] ([ScheduledActionID]);

-- Index for foreign key ActionParamID in table ScheduledActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledActionParam_ActionParamID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledActionParam_ActionParamID ON [${flyway:defaultSchema}].[ScheduledActionParam] ([ActionParamID]);

/* Index for Foreign Keys for GeneratedCodeCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table GeneratedCodeCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCodeCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCodeCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCodeCategory_ParentID ON [${flyway:defaultSchema}].[GeneratedCodeCategory] ([ParentID]);

/* Base View SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: vwScheduledActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Scheduled Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledActionParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledActionParams]
AS
SELECT
    s.*,
    ScheduledAction_ScheduledActionID.[Name] AS [ScheduledAction],
    ActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [${flyway:defaultSchema}].[ScheduledActionParam] AS s
INNER JOIN
    [${flyway:defaultSchema}].[ScheduledAction] AS ScheduledAction_ScheduledActionID
  ON
    [s].[ScheduledActionID] = ScheduledAction_ScheduledActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ActionParam] AS ActionParam_ActionParamID
  ON
    [s].[ActionParamID] = ActionParam_ActionParamID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: Permissions for vwScheduledActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: spCreateScheduledActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledActionParam]
    @ScheduledActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ScheduledActionParam]
        (
            [ScheduledActionID],
            [ActionParamID],
            [ValueType],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ScheduledActionID,
            @ActionParamID,
            @ValueType,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Scheduled Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: spUpdateScheduledActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledActionParam]
    @ID uniqueidentifier,
    @ScheduledActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledActionParam]
    SET
        [ScheduledActionID] = @ScheduledActionID,
        [ActionParamID] = @ActionParamID,
        [ValueType] = @ValueType,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledActionParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateScheduledActionParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledActionParam
ON [${flyway:defaultSchema}].[ScheduledActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Scheduled Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: spDeleteScheduledActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledActionParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledActionParam] TO [cdp_Integration]
    

/* spDelete Permissions for Scheduled Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledActionParam] TO [cdp_Integration]



/* Base View SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: vwGeneratedCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Generated Code Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeneratedCodeCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
AS
SELECT
    g.*,
    GeneratedCodeCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS g
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS GeneratedCodeCategory_ParentID
  ON
    [g].[ParentID] = GeneratedCodeCategory_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: Permissions for vwGeneratedCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: spCreateGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[GeneratedCodeCategory]
        (
            [Name],
            [Description],
            [ParentID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: spUpdateGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeneratedCodeCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateGeneratedCodeCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeneratedCodeCategory
ON [${flyway:defaultSchema}].[GeneratedCodeCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeneratedCodeCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: spDeleteGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory] TO [cdp_Integration]
    

/* spDelete Permissions for Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory] TO [cdp_Integration]



/* Index for Foreign Keys for AIVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for AIConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultPromptForContextCompressionID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextCompressionID]);

-- Index for foreign key DefaultPromptForContextSummarizationID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextSummarizationID]);

/* SQL text to update entity field related entity name field map for entity field ID 7C9C04C8-4778-48D6-A1BE-D85D8381DC4B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7C9C04C8-4778-48D6-A1BE-D85D8381DC4B',
         @RelatedEntityNameFieldMap='DefaultPromptForContextCompression'

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

/* SQL text to update entity field related entity name field map for entity field ID A6F8773F-4021-45DD-B142-9BFE4F67EC87 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A6F8773F-4021-45DD-B142-9BFE4F67EC87',
         @RelatedEntityNameFieldMap='Parent'

/* Index for Foreign Keys for AIPromptModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_PromptID ON [${flyway:defaultSchema}].[AIPromptModel] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_ModelID ON [${flyway:defaultSchema}].[AIPromptModel] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_VendorID ON [${flyway:defaultSchema}].[AIPromptModel] ([VendorID]);

-- Index for foreign key ConfigurationID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptModel] ([ConfigurationID]);

/* SQL text to update entity field related entity name field map for entity field ID B2CC3BF9-108B-4703-97A1-6E477ED9D8A9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B2CC3BF9-108B-4703-97A1-6E477ED9D8A9',
         @RelatedEntityNameFieldMap='Prompt'

/* Base View SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: vwAIVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIVendors]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIVendors]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIVendor] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: Permissions for vwAIVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spCreateAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIVendor]
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIVendor]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spUpdateAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIVendor]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendor]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIVendor table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIVendor
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIVendor
ON [${flyway:defaultSchema}].[AIVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendor] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spDeleteAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIVendor]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendor] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 10370467-1CCD-4A86-AF3F-39BE67B19B99 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='10370467-1CCD-4A86-AF3F-39BE67B19B99',
         @RelatedEntityNameFieldMap='Model'

/* SQL text to update entity field related entity name field map for entity field ID FFD209C5-48F3-45D1-9094-E76EC832EA07 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FFD209C5-48F3-45D1-9094-E76EC832EA07',
         @RelatedEntityNameFieldMap='ContextCompressionPrompt'

/* SQL text to update entity field related entity name field map for entity field ID 6686738D-6185-4899-AED0-2295F02D5F75 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6686738D-6185-4899-AED0-2295F02D5F75',
         @RelatedEntityNameFieldMap='DefaultPromptForContextSummarization'

/* SQL text to update entity field related entity name field map for entity field ID D7CD881D-840D-4A68-BCDA-2203E74E62A5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D7CD881D-840D-4A68-BCDA-2203E74E62A5',
         @RelatedEntityNameFieldMap='Vendor'

/* Base View SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIConfigurations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurations]
AS
SELECT
    a.*,
    AIPrompt_DefaultPromptForContextCompressionID.[Name] AS [DefaultPromptForContextCompression],
    AIPrompt_DefaultPromptForContextSummarizationID.[Name] AS [DefaultPromptForContextSummarization]
FROM
    [${flyway:defaultSchema}].[AIConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextCompressionID
  ON
    [a].[DefaultPromptForContextCompressionID] = AIPrompt_DefaultPromptForContextCompressionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextSummarizationID
  ON
    [a].[DefaultPromptForContextSummarizationID] = AIPrompt_DefaultPromptForContextSummarizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Permissions for vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spCreateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIConfiguration]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIConfiguration]
        (
            [Name],
            [Description],
            [IsDefault],
            [Status],
            [DefaultPromptForContextCompressionID],
            [DefaultPromptForContextSummarizationID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @IsDefault,
            @Status,
            @DefaultPromptForContextCompressionID,
            @DefaultPromptForContextSummarizationID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spUpdateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIConfiguration]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsDefault] = @IsDefault,
        [Status] = @Status,
        [DefaultPromptForContextCompressionID] = @DefaultPromptForContextCompressionID,
        [DefaultPromptForContextSummarizationID] = @DefaultPromptForContextSummarizationID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfiguration table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIConfiguration
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIConfiguration
ON [${flyway:defaultSchema}].[AIConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIConfiguration]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]



/* Base View SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_ParentID
  ON
    [a].[ParentID] = AIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = AIPrompt_ContextCompressionPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgent]
        (
            [Name],
            [Description],
            [LogoURL],
            [ParentID],
            [ExposeAsAction],
            [ExecutionOrder],
            [ExecutionMode],
            [EnableContextCompression],
            [ContextCompressionMessageThreshold],
            [ContextCompressionPromptID],
            [ContextCompressionMessageRetentionCount]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @LogoURL,
            @ParentID,
            @ExposeAsAction,
            @ExecutionOrder,
            @ExecutionMode,
            @EnableContextCompression,
            @ContextCompressionMessageThreshold,
            @ContextCompressionPromptID,
            @ContextCompressionMessageRetentionCount
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL,
        [ParentID] = @ParentID,
        [ExposeAsAction] = @ExposeAsAction,
        [ExecutionOrder] = @ExecutionOrder,
        [ExecutionMode] = @ExecutionMode,
        [EnableContextCompression] = @EnableContextCompression,
        [ContextCompressionMessageThreshold] = @ContextCompressionMessageThreshold,
        [ContextCompressionPromptID] = @ContextCompressionPromptID,
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID EE922F4A-D61D-4222-8C7F-7FEA211ADDC9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EE922F4A-D61D-4222-8C7F-7FEA211ADDC9',
         @RelatedEntityNameFieldMap='Configuration'

/* Base View SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: vwAIPromptModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPromptModels]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptModels]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIPromptModel] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: Permissions for vwAIPromptModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spCreateAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptModel]
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Priority int,
    @ExecutionGroup int,
    @ModelParameters nvarchar(MAX),
    @Status nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPromptModel]
        (
            [PromptID],
            [ModelID],
            [VendorID],
            [ConfigurationID],
            [Priority],
            [ExecutionGroup],
            [ModelParameters],
            [Status],
            [ParallelizationMode],
            [ParallelCount],
            [ParallelConfigParam]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @PromptID,
            @ModelID,
            @VendorID,
            @ConfigurationID,
            @Priority,
            @ExecutionGroup,
            @ModelParameters,
            @Status,
            @ParallelizationMode,
            @ParallelCount,
            @ParallelConfigParam
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptModel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spUpdateAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPromptModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptModel]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Priority int,
    @ExecutionGroup int,
    @ModelParameters nvarchar(MAX),
    @Status nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptModel]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [ConfigurationID] = @ConfigurationID,
        [Priority] = @Priority,
        [ExecutionGroup] = @ExecutionGroup,
        [ModelParameters] = @ModelParameters,
        [Status] = @Status,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptModel table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPromptModel
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptModel
ON [${flyway:defaultSchema}].[AIPromptModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spDeleteAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPromptModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptModel]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptModel] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptModel] TO [cdp_Integration]



/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID ON [${flyway:defaultSchema}].[AIPrompt] ([TemplateID]);

-- Index for foreign key CategoryID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID ON [${flyway:defaultSchema}].[AIPrompt] ([CategoryID]);

-- Index for foreign key TypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TypeID ON [${flyway:defaultSchema}].[AIPrompt] ([TypeID]);

-- Index for foreign key AIModelTypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID ON [${flyway:defaultSchema}].[AIPrompt] ([AIModelTypeID]);

-- Index for foreign key ResultSelectorPromptID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID ON [${flyway:defaultSchema}].[AIPrompt] ([ResultSelectorPromptID]);

/* SQL text to update entity field related entity name field map for entity field ID CDA86CD9-BE45-45BE-8D10-643F8F1EDAAD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CDA86CD9-BE45-45BE-8D10-643F8F1EDAAD',
         @RelatedEntityNameFieldMap='AIModelType'

/* Index for Foreign Keys for AIResultCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIPromptID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AIPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AIPromptID ON [${flyway:defaultSchema}].[AIResultCache] ([AIPromptID]);

-- Index for foreign key AIModelID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AIModelID ON [${flyway:defaultSchema}].[AIResultCache] ([AIModelID]);

-- Index for foreign key VendorID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_VendorID ON [${flyway:defaultSchema}].[AIResultCache] ([VendorID]);

-- Index for foreign key AgentID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AgentID ON [${flyway:defaultSchema}].[AIResultCache] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_ConfigurationID ON [${flyway:defaultSchema}].[AIResultCache] ([ConfigurationID]);

-- Index for foreign key PromptRunID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_PromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_PromptRunID ON [${flyway:defaultSchema}].[AIResultCache] ([PromptRunID]);

/* SQL text to update entity field related entity name field map for entity field ID F332D3A9-5402-4E82-90E4-DDB3F4315F19 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F332D3A9-5402-4E82-90E4-DDB3F4315F19',
         @RelatedEntityNameFieldMap='Vendor'

/* SQL text to update entity field related entity name field map for entity field ID 257026B1-1FD2-4B71-B94D-F97E7FEE6023 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='257026B1-1FD2-4B71-B94D-F97E7FEE6023',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID CB91DE8E-B02C-42DD-9252-44D3905A5B9E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CB91DE8E-B02C-42DD-9252-44D3905A5B9E',
         @RelatedEntityNameFieldMap='ResultSelectorPrompt'

/* SQL text to update entity field related entity name field map for entity field ID 4D991B48-52BD-4609-B8C1-71529BF8E9E8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4D991B48-52BD-4609-B8C1-71529BF8E9E8',
         @RelatedEntityNameFieldMap='Configuration'

/* Base View SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type],
    AIModelType_AIModelTypeID.[Name] AS [AIModelType],
    AIPrompt_ResultSelectorPromptID.[Name] AS [ResultSelectorPrompt]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID
  ON
    [a].[TypeID] = AIPromptType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ResultSelectorPromptID
  ON
    [a].[ResultSelectorPromptID] = AIPrompt_ResultSelectorPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPrompt]
        (
            [Name],
            [Description],
            [TemplateID],
            [CategoryID],
            [TypeID],
            [Status],
            [ResponseFormat],
            [ModelSpecificResponseFormat],
            [AIModelTypeID],
            [MinPowerRank],
            [SelectionStrategy],
            [PowerPreference],
            [ParallelizationMode],
            [ParallelCount],
            [ParallelConfigParam],
            [OutputType],
            [OutputExample],
            [ValidationBehavior],
            [MaxRetries],
            [RetryDelayMS],
            [RetryStrategy],
            [ResultSelectorPromptID],
            [EnableCaching],
            [CacheTTLSeconds],
            [CacheMatchType],
            [CacheSimilarityThreshold],
            [CacheMustMatchModel],
            [CacheMustMatchVendor],
            [CacheMustMatchAgent],
            [CacheMustMatchConfig]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @TemplateID,
            @CategoryID,
            @TypeID,
            @Status,
            @ResponseFormat,
            @ModelSpecificResponseFormat,
            @AIModelTypeID,
            @MinPowerRank,
            @SelectionStrategy,
            @PowerPreference,
            @ParallelizationMode,
            @ParallelCount,
            @ParallelConfigParam,
            @OutputType,
            @OutputExample,
            @ValidationBehavior,
            @MaxRetries,
            @RetryDelayMS,
            @RetryStrategy,
            @ResultSelectorPromptID,
            @EnableCaching,
            @CacheTTLSeconds,
            @CacheMatchType,
            @CacheSimilarityThreshold,
            @CacheMustMatchModel,
            @CacheMustMatchVendor,
            @CacheMustMatchAgent,
            @CacheMustMatchConfig
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for AI Prompts */




/* spUpdate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [TemplateID] = @TemplateID,
        [CategoryID] = @CategoryID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [ResponseFormat] = @ResponseFormat,
        [ModelSpecificResponseFormat] = @ModelSpecificResponseFormat,
        [AIModelTypeID] = @AIModelTypeID,
        [MinPowerRank] = @MinPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [PowerPreference] = @PowerPreference,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam,
        [OutputType] = @OutputType,
        [OutputExample] = @OutputExample,
        [ValidationBehavior] = @ValidationBehavior,
        [MaxRetries] = @MaxRetries,
        [RetryDelayMS] = @RetryDelayMS,
        [RetryStrategy] = @RetryStrategy,
        [ResultSelectorPromptID] = @ResultSelectorPromptID,
        [EnableCaching] = @EnableCaching,
        [CacheTTLSeconds] = @CacheTTLSeconds,
        [CacheMatchType] = @CacheMatchType,
        [CacheSimilarityThreshold] = @CacheSimilarityThreshold,
        [CacheMustMatchModel] = @CacheMustMatchModel,
        [CacheMustMatchVendor] = @CacheMustMatchVendor,
        [CacheMustMatchAgent] = @CacheMustMatchAgent,
        [CacheMustMatchConfig] = @CacheMustMatchConfig
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPrompt
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPrompt
ON [${flyway:defaultSchema}].[AIPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Prompts */




/* spDelete SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for AI Prompts */




/* Base View SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: vwAIResultCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Result Cache
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIResultCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIResultCaches]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIResultCaches]
AS
SELECT
    a.*,
    AIPrompt_AIPromptID.[Name] AS [AIPrompt],
    AIModel_AIModelID.[Name] AS [AIModel],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIResultCache] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_AIPromptID
  ON
    [a].[AIPromptID] = AIPrompt_AIPromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID
  ON
    [a].[AIModelID] = AIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: Permissions for vwAIResultCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spCreateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIResultCache]
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @PromptEmbedding varbinary,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIResultCache]
        (
            [AIPromptID],
            [AIModelID],
            [RunAt],
            [PromptText],
            [ResultText],
            [Status],
            [ExpiredOn],
            [VendorID],
            [AgentID],
            [ConfigurationID],
            [PromptEmbedding],
            [PromptRunID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AIPromptID,
            @AIModelID,
            @RunAt,
            @PromptText,
            @ResultText,
            @Status,
            @ExpiredOn,
            @VendorID,
            @AgentID,
            @ConfigurationID,
            @PromptEmbedding,
            @PromptRunID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIResultCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for AI Result Cache */




/* spUpdate SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spUpdateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIResultCache]
    @ID uniqueidentifier,
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @PromptEmbedding varbinary,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        [AIPromptID] = @AIPromptID,
        [AIModelID] = @AIModelID,
        [RunAt] = @RunAt,
        [PromptText] = @PromptText,
        [ResultText] = @ResultText,
        [Status] = @Status,
        [ExpiredOn] = @ExpiredOn,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [PromptEmbedding] = @PromptEmbedding,
        [PromptRunID] = @PromptRunID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIResultCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIResultCache table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIResultCache
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIResultCache
ON [${flyway:defaultSchema}].[AIResultCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIResultCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Result Cache */




/* spDelete SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spDeleteAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIResultCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIResultCache]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for AI Result Cache */




/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityField]
        (
            [DisplayName],
            [Description],
            [AutoUpdateDescription],
            [IsPrimaryKey],
            [IsUnique],
            [Category],
            [ValueListType],
            [ExtendedType],
            [CodeType],
            [DefaultInView],
            [ViewCellTemplate],
            [DefaultColumnWidth],
            [AllowUpdateAPI],
            [AllowUpdateInView],
            [IncludeInUserSearchAPI],
            [FullTextSearchEnabled],
            [UserSearchParamFormatAPI],
            [IncludeInGeneratedForm],
            [GeneratedFormSection],
            [IsNameField],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IncludeRelatedEntityNameFieldInBaseView],
            [RelatedEntityNameFieldMap],
            [RelatedEntityDisplayType],
            [EntityIDFieldName],
            [ScopeDefault],
            [AutoUpdateRelatedEntityInfo],
            [ValuesToPackWithSchema]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DisplayName,
            @Description,
            @AutoUpdateDescription,
            @IsPrimaryKey,
            @IsUnique,
            @Category,
            @ValueListType,
            @ExtendedType,
            @CodeType,
            @DefaultInView,
            @ViewCellTemplate,
            @DefaultColumnWidth,
            @AllowUpdateAPI,
            @AllowUpdateInView,
            @IncludeInUserSearchAPI,
            @FullTextSearchEnabled,
            @UserSearchParamFormatAPI,
            @IncludeInGeneratedForm,
            @GeneratedFormSection,
            @IsNameField,
            @RelatedEntityID,
            @RelatedEntityFieldName,
            @IncludeRelatedEntityNameFieldInBaseView,
            @RelatedEntityNameFieldMap,
            @RelatedEntityDisplayType,
            @EntityIDFieldName,
            @ScopeDefault,
            @AutoUpdateRelatedEntityInfo,
            @ValuesToPackWithSchema
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityField
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [DeleteType],
            [AllowRecordMerge],
            [spMatch],
            [RelationshipDefaultDisplayType],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon],
            [ScopeDefault],
            [RowsToPackWithSchema],
            [RowsToPackSampleMethod],
            [RowsToPackSampleCount],
            [RowsToPackSampleOrder]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @DeleteType,
            @AllowRecordMerge,
            @spMatch,
            @RelationshipDefaultDisplayType,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon,
            @ScopeDefault,
            @RowsToPackWithSchema,
            @RowsToPackSampleMethod,
            @RowsToPackSampleCount,
            @RowsToPackSampleOrder
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntity
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityRelationship]
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
            @Sequence,
            @RelatedEntityID,
            @BundleInAPI,
            @IncludeInParentAllQuery,
            @Type,
            @EntityKeyField,
            @RelatedEntityJoinField,
            @JoinView,
            @JoinEntityJoinField,
            @JoinEntityInverseJoinField,
            @DisplayInForm,
            @DisplayLocation,
            @DisplayName,
            @DisplayIconType,
            @DisplayIcon,
            @DisplayComponentID,
            @DisplayComponentConfiguration,
            @AutoUpdateFromSchema
        )
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityRelationship]
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

    -- return the updated record so the caller can see the updated values and any calculated fields
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityRelationship
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityRelationship]
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


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for Application */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: vwApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Applications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Application
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwApplications]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwApplications]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[Application] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwApplications] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: Permissions for vwApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplications] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: spCreateApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Application
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateApplication]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplication]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit,
    @SchemaAutoAddNewEntities nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Application]
        (
            [Name],
            [Description],
            [Icon],
            [DefaultForNewUser],
            [__mj_CreatedAt],
            [__mj_UpdatedAt],
            [SchemaAutoAddNewEntities]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Icon,
            @DefaultForNewUser,
            GETUTCDATE(),
            GETUTCDATE(),
            @SchemaAutoAddNewEntities
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplication] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplication] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: spUpdateApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Application
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateApplication]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplication]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit,
    @SchemaAutoAddNewEntities nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Application]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [DefaultForNewUser] = @DefaultForNewUser,
        [SchemaAutoAddNewEntities] = @SchemaAutoAddNewEntities
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Application table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateApplication
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplication
ON [${flyway:defaultSchema}].[Application]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Application]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Application] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplication] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteApplication]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Application]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for ListDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ListID in table ListDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListDetail_ListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListDetail_ListID ON [${flyway:defaultSchema}].[ListDetail] ([ListID]);

/* Base View SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: vwListDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      List Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ListDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwListDetails]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwListDetails]
AS
SELECT
    l.*,
    List_ListID.[Name] AS [List]
FROM
    [${flyway:defaultSchema}].[ListDetail] AS l
INNER JOIN
    [${flyway:defaultSchema}].[List] AS List_ListID
  ON
    [l].[ListID] = List_ListID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwListDetails] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: Permissions for vwListDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwListDetails] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: spCreateListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ListDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateListDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateListDetail]
    @ListID uniqueidentifier,
    @RecordID nvarchar(445),
    @Sequence int,
    @Status nvarchar(30),
    @AdditionalData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ListDetail]
        (
            [ListID],
            [RecordID],
            [Sequence],
            [Status],
            [AdditionalData]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ListID,
            @RecordID,
            @Sequence,
            @Status,
            @AdditionalData
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwListDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListDetail] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for List Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListDetail] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: spUpdateListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ListDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateListDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateListDetail]
    @ID uniqueidentifier,
    @ListID uniqueidentifier,
    @RecordID nvarchar(445),
    @Sequence int,
    @Status nvarchar(30),
    @AdditionalData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListDetail]
    SET
        [ListID] = @ListID,
        [RecordID] = @RecordID,
        [Sequence] = @Sequence,
        [Status] = @Status,
        [AdditionalData] = @AdditionalData
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwListDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListDetail] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ListDetail table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateListDetail
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateListDetail
ON [${flyway:defaultSchema}].[ListDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ListDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for List Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListDetail] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: spDeleteListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteListDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteListDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ListDetail]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListDetail] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for List Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListDetail] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for AuditLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_UserID ON [${flyway:defaultSchema}].[AuditLog] ([UserID]);

-- Index for foreign key AuditLogTypeID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_AuditLogTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_AuditLogTypeID ON [${flyway:defaultSchema}].[AuditLog] ([AuditLogTypeID]);

-- Index for foreign key AuthorizationID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_AuthorizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_AuthorizationID ON [${flyway:defaultSchema}].[AuditLog] ([AuthorizationID]);

-- Index for foreign key EntityID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_EntityID ON [${flyway:defaultSchema}].[AuditLog] ([EntityID]);

/* Base View SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: vwAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Audit Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAuditLogs]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuditLogs]
AS
SELECT
    a.*,
    User_UserID.[Name] AS [User],
    AuditLogType_AuditLogTypeID.[Name] AS [AuditLogType],
    Authorization_AuthorizationID.[Name] AS [Authorization],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[AuditLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AuditLogType] AS AuditLogType_AuditLogTypeID
  ON
    [a].[AuditLogTypeID] = AuditLogType_AuditLogTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Authorization] AS Authorization_AuthorizationID
  ON
    [a].[AuthorizationID] = Authorization_AuthorizationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [a].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: Permissions for vwAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: spCreateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAuditLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog]
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AuditLog]
        (
            [UserID],
            [AuditLogTypeID],
            [AuthorizationID],
            [Status],
            [Description],
            [Details],
            [EntityID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @AuditLogTypeID,
            @AuthorizationID,
            @Status,
            @Description,
            @Details,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuditLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: spUpdateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AuditLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAuditLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAuditLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLog]
    SET
        [UserID] = @UserID,
        [AuditLogTypeID] = @AuditLogTypeID,
        [AuthorizationID] = @AuthorizationID,
        [Status] = @Status,
        [Description] = @Description,
        [Details] = @Details,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAuditLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLog] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuditLog table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAuditLog
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAuditLog
ON [${flyway:defaultSchema}].[AuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AuditLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLog] TO [cdp_Developer]



/* Index for Foreign Keys for AIModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelTypeID in table AIModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID ON [${flyway:defaultSchema}].[AIModel] ([AIModelTypeID]);

/* Base View Permissions SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: Permissions for vwAIModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spCreateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModel]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModel]
        (
            [Name],
            [Description],
            [AIModelTypeID],
            [PowerRank],
            [IsActive],
            [SpeedRank],
            [CostRank],
            [ModelSelectionInsights]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @AIModelTypeID,
            @PowerRank,
            @IsActive,
            @SpeedRank,
            @CostRank,
            @ModelSelectionInsights
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spUpdateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModel]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [AIModelTypeID] = @AIModelTypeID,
        [PowerRank] = @PowerRank,
        [IsActive] = @IsActive,
        [SpeedRank] = @SpeedRank,
        [CostRank] = @CostRank,
        [ModelSelectionInsights] = @ModelSelectionInsights
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModel table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModel
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModel
ON [${flyway:defaultSchema}].[AIModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spDeleteAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModel]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]
    

/* spDelete Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]



/* Index for Foreign Keys for DatasetItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DatasetID in table DatasetItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DatasetItem_DatasetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DatasetItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DatasetItem_DatasetID ON [${flyway:defaultSchema}].[DatasetItem] ([DatasetID]);

-- Index for foreign key EntityID in table DatasetItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DatasetItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DatasetItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DatasetItem_EntityID ON [${flyway:defaultSchema}].[DatasetItem] ([EntityID]);

/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID]);

-- Index for foreign key UserID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_UserID ON [${flyway:defaultSchema}].[ConversationDetail] ([UserID]);

-- Index for foreign key ArtifactID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactVersionID]);

/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_UserID ON [${flyway:defaultSchema}].[Conversation] ([UserID]);

-- Index for foreign key LinkedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID]);

-- Index for foreign key DataContextID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DataContextID ON [${flyway:defaultSchema}].[Conversation] ([DataContextID]);

/* Base View SQL for Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: vwDatasetItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dataset Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DatasetItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDatasetItems]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDatasetItems]
AS
SELECT
    d.*,
    Dataset_DatasetID.[Name] AS [Dataset],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[DatasetItem] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Dataset] AS Dataset_DatasetID
  ON
    [d].[DatasetID] = Dataset_DatasetID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDatasetItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: Permissions for vwDatasetItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDatasetItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spDelete SQL for Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: spDeleteDatasetItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DatasetItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDatasetItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDatasetItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DatasetItem]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Dataset Items */




/* Base View SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationDetails]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    ConversationArtifact_ArtifactID.[Name] AS [Artifact]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = ConversationArtifact_ArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationDetail]
        (
            [ConversationID],
            [ExternalID],
            [Role],
            [Message],
            [Error],
            [HiddenToUser],
            [UserRating],
            [UserFeedback],
            [ReflectionInsights],
            [SummaryOfEarlierConversation],
            [UserID],
            [ArtifactID],
            [ArtifactVersionID],
            [CompletionTime]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConversationID,
            @ExternalID,
            @Role,
            @Message,
            @Error,
            @HiddenToUser,
            @UserRating,
            @UserFeedback,
            @ReflectionInsights,
            @SummaryOfEarlierConversation,
            @UserID,
            @ArtifactID,
            @ArtifactVersionID,
            @CompletionTime
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser,
        [UserRating] = @UserRating,
        [UserFeedback] = @UserFeedback,
        [ReflectionInsights] = @ReflectionInsights,
        [SummaryOfEarlierConversation] = @SummaryOfEarlierConversation,
        [UserID] = @UserID,
        [ArtifactID] = @ArtifactID,
        [ArtifactVersionID] = @ArtifactVersionID,
        [CompletionTime] = @CompletionTime
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationDetail
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* Base View SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT
    c.*,
    User_UserID.[Name] AS [User],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity],
    DataContext_DataContextID.[Name] AS [DataContext]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [c].[DataContextID] = DataContext_DataContextID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversation]
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Conversation]
        (
            [UserID],
            [ExternalID],
            [Name],
            [Description],
            [Type],
            [IsArchived],
            [LinkedEntityID],
            [LinkedRecordID],
            [DataContextID],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @ExternalID,
            @Name,
            @Description,
            @Type,
            @IsArchived,
            @LinkedEntityID,
            @LinkedRecordID,
            @DataContextID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [IsArchived] = @IsArchived,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordID] = @LinkedRecordID,
        [DataContextID] = @DataContextID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversation
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversation
ON [${flyway:defaultSchema}].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Conversation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* Index for Foreign Keys for DataContextItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DataContextID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_DataContextID ON [${flyway:defaultSchema}].[DataContextItem] ([DataContextID]);

-- Index for foreign key ViewID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_ViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_ViewID ON [${flyway:defaultSchema}].[DataContextItem] ([ViewID]);

-- Index for foreign key QueryID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_QueryID ON [${flyway:defaultSchema}].[DataContextItem] ([QueryID]);

-- Index for foreign key EntityID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_EntityID ON [${flyway:defaultSchema}].[DataContextItem] ([EntityID]);

/* Index for Foreign Keys for UserViewCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table UserViewCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewCategory_ParentID ON [${flyway:defaultSchema}].[UserViewCategory] ([ParentID]);

-- Index for foreign key EntityID in table UserViewCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewCategory_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewCategory_EntityID ON [${flyway:defaultSchema}].[UserViewCategory] ([EntityID]);

-- Index for foreign key UserID in table UserViewCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewCategory_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewCategory_UserID ON [${flyway:defaultSchema}].[UserViewCategory] ([UserID]);

/* Base View SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: vwDataContextItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Data Context Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DataContextItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDataContextItems]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDataContextItems]
AS
SELECT
    d.*,
    DataContext_DataContextID.[Name] AS [DataContext],
    UserView_ViewID.[Name] AS [View],
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[DataContextItem] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [d].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS UserView_ViewID
  ON
    [d].[ViewID] = UserView_ViewID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [d].[QueryID] = Query_QueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContextItems] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: Permissions for vwDataContextItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContextItems] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spCreateDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DataContextItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDataContextItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDataContextItem]
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetime,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[DataContextItem]
        (
            [DataContextID],
            [Type],
            [ViewID],
            [QueryID],
            [EntityID],
            [RecordID],
            [SQL],
            [DataJSON],
            [LastRefreshedAt],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DataContextID,
            @Type,
            @ViewID,
            @QueryID,
            @EntityID,
            @RecordID,
            @SQL,
            @DataJSON,
            @LastRefreshedAt,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDataContextItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spUpdateDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DataContextItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDataContextItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContextItem]
    @ID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetime,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContextItem]
    SET
        [DataContextID] = @DataContextID,
        [Type] = @Type,
        [ViewID] = @ViewID,
        [QueryID] = @QueryID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [SQL] = @SQL,
        [DataJSON] = @DataJSON,
        [LastRefreshedAt] = @LastRefreshedAt,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDataContextItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DataContextItem table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDataContextItem
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDataContextItem
ON [${flyway:defaultSchema}].[DataContextItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContextItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DataContextItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spDeleteDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContextItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDataContextItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContextItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DataContextItem]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* Base View SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: vwUserViewCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User View Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwUserViewCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewCategories]
AS
SELECT
    u.*,
    UserViewCategory_ParentID.[Name] AS [Parent],
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[UserViewCategory] AS u
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserViewCategory] AS UserViewCategory_ParentID
  ON
    [u].[ParentID] = UserViewCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [u].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: Permissions for vwUserViewCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: spCreateUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateUserViewCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[UserViewCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [EntityID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @EntityID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViewCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: spUpdateUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateUserViewCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [EntityID] = @EntityID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViewCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserViewCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateUserViewCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserViewCategory
ON [${flyway:defaultSchema}].[UserViewCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserViewCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: spDeleteUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteUserViewCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserViewCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for ActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionParam_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionParam_ActionID ON [${flyway:defaultSchema}].[ActionParam] ([ActionID]);

/* Base View SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: vwActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwActionParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionParams]
AS
SELECT
    a.*,
    Action_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[ActionParam] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionParams] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: Permissions for vwActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionParams] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: spCreateActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionParam]
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit,
    @Description nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ActionParam]
        (
            [ActionID],
            [Name],
            [DefaultValue],
            [Type],
            [ValueType],
            [IsArray],
            [Description],
            [IsRequired]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @Name,
            @DefaultValue,
            @Type,
            @ValueType,
            @IsArray,
            @Description,
            @IsRequired
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionParam] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionParam] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: spUpdateActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionParam]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit,
    @Description nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionParam]
    SET
        [ActionID] = @ActionID,
        [Name] = @Name,
        [DefaultValue] = @DefaultValue,
        [Type] = @Type,
        [ValueType] = @ValueType,
        [IsArray] = @IsArray,
        [Description] = @Description,
        [IsRequired] = @IsRequired
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionParam] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateActionParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionParam
ON [${flyway:defaultSchema}].[ActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionParam] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: spDeleteActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionParam] TO [cdp_Integration]
    

/* spDelete Permissions for Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionParam] TO [cdp_Integration]



/* Index for Foreign Keys for CommunicationProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: vwCommunicationProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommunicationProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwCommunicationProviders]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationProviders]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CommunicationProvider] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: Permissions for vwCommunicationProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: spCreateCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCommunicationProvider]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationProvider]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit,
    @SupportsScheduledSending bit,
    @SupportsForwarding bit,
    @SupportsReplying bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[CommunicationProvider]
        (
            [Name],
            [Description],
            [Status],
            [SupportsSending],
            [SupportsReceiving],
            [SupportsScheduledSending],
            [SupportsForwarding],
            [SupportsReplying]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @SupportsSending,
            @SupportsReceiving,
            @SupportsScheduledSending,
            @SupportsForwarding,
            @SupportsReplying
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Communication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: spUpdateCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCommunicationProvider]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationProvider]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit,
    @SupportsScheduledSending bit,
    @SupportsForwarding bit,
    @SupportsReplying bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationProvider]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [SupportsSending] = @SupportsSending,
        [SupportsReceiving] = @SupportsReceiving,
        [SupportsScheduledSending] = @SupportsScheduledSending,
        [SupportsForwarding] = @SupportsForwarding,
        [SupportsReplying] = @SupportsReplying
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommunicationProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationProvider table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateCommunicationProvider
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationProvider
ON [${flyway:defaultSchema}].[CommunicationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Communication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: spDeleteCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteCommunicationProvider]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommunicationProvider]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationProvider] TO [cdp_Integration]
    

/* spDelete Permissions for Communication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationProvider] TO [cdp_Integration]



/* Index for Foreign Keys for TemplateParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Template Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table TemplateParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TemplateParam_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TemplateParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TemplateParam_TemplateID ON [${flyway:defaultSchema}].[TemplateParam] ([TemplateID]);

-- Index for foreign key EntityID in table TemplateParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TemplateParam_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TemplateParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TemplateParam_EntityID ON [${flyway:defaultSchema}].[TemplateParam] ([EntityID]);

/* Base View SQL for Template Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Template Params
-- Item: vwTemplateParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Template Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TemplateParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwTemplateParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTemplateParams]
AS
SELECT
    t.*,
    Template_TemplateID.[Name] AS [Template],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[TemplateParam] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [t].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [t].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplateParams] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Template Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Template Params
-- Item: Permissions for vwTemplateParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplateParams] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Template Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Template Params
-- Item: spCreateTemplateParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TemplateParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateTemplateParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTemplateParam]
    @TemplateID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @LinkedParameterName nvarchar(255),
    @LinkedParameterField nvarchar(500),
    @ExtraFilter nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(2000),
    @OrderBy nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[TemplateParam]
        (
            [TemplateID],
            [Name],
            [Description],
            [Type],
            [DefaultValue],
            [IsRequired],
            [LinkedParameterName],
            [LinkedParameterField],
            [ExtraFilter],
            [EntityID],
            [RecordID],
            [OrderBy]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @TemplateID,
            @Name,
            @Description,
            @Type,
            @DefaultValue,
            @IsRequired,
            @LinkedParameterName,
            @LinkedParameterField,
            @ExtraFilter,
            @EntityID,
            @RecordID,
            @OrderBy
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTemplateParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplateParam] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Template Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplateParam] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Template Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Template Params
-- Item: spUpdateTemplateParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TemplateParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateTemplateParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplateParam]
    @ID uniqueidentifier,
    @TemplateID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @LinkedParameterName nvarchar(255),
    @LinkedParameterField nvarchar(500),
    @ExtraFilter nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(2000),
    @OrderBy nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TemplateParam]
    SET
        [TemplateID] = @TemplateID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [DefaultValue] = @DefaultValue,
        [IsRequired] = @IsRequired,
        [LinkedParameterName] = @LinkedParameterName,
        [LinkedParameterField] = @LinkedParameterField,
        [ExtraFilter] = @ExtraFilter,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [OrderBy] = @OrderBy
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTemplateParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplateParam] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TemplateParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateTemplateParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTemplateParam
ON [${flyway:defaultSchema}].[TemplateParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TemplateParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TemplateParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Template Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplateParam] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Template Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Template Params
-- Item: spDeleteTemplateParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TemplateParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteTemplateParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplateParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TemplateParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplateParam] TO [cdp_Integration]
    

/* spDelete Permissions for Template Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplateParam] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 76BA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='76BA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID DCBA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DCBA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for ConversationArtifactVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationArtifactID in table ConversationArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifactVersion_ConversationArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifactVersion_ConversationArtifactID ON [${flyway:defaultSchema}].[ConversationArtifactVersion] ([ConversationArtifactID]);

/* Base View SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: vwConversationArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifactVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifactVersions]
AS
SELECT
    c.*,
    ConversationArtifact_ConversationArtifactID.[Name] AS [ConversationArtifact]
FROM
    [${flyway:defaultSchema}].[ConversationArtifactVersion] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ConversationArtifactID
  ON
    [c].[ConversationArtifactID] = ConversationArtifact_ConversationArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: Permissions for vwConversationArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spCreateConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifactVersion]
    @ConversationArtifactID uniqueidentifier,
    @Version int,
    @Configuration nvarchar(MAX),
    @Content nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifactVersion]
        (
            [ConversationArtifactID],
            [Version],
            [Configuration],
            [Content],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConversationArtifactID,
            @Version,
            @Configuration,
            @Content,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifactVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spUpdateConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion]
    @ID uniqueidentifier,
    @ConversationArtifactID uniqueidentifier,
    @Version int,
    @Configuration nvarchar(MAX),
    @Content nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    SET
        [ConversationArtifactID] = @ConversationArtifactID,
        [Version] = @Version,
        [Configuration] = @Configuration,
        [Content] = @Content,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifactVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifactVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifactVersion
ON [${flyway:defaultSchema}].[ConversationArtifactVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID DEBA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DEBA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 8EBA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8EBA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 94BA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94BA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for AIModelVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID ON [${flyway:defaultSchema}].[AIModelVendor] ([ModelID]);

-- Index for foreign key VendorID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID ON [${flyway:defaultSchema}].[AIModelVendor] ([VendorID]);

/* SQL text to update entity field related entity name field map for entity field ID C7583B81-0BC4-4302-98ED-BE6E5DD22D50 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C7583B81-0BC4-4302-98ED-BE6E5DD22D50',
         @RelatedEntityNameFieldMap='Model'

/* Index for Foreign Keys for AIVendorTypeDefinition */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ReportUserState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReportID in table ReportUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportUserState_ReportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportUserState_ReportID ON [${flyway:defaultSchema}].[ReportUserState] ([ReportID]);

-- Index for foreign key UserID in table ReportUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportUserState_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportUserState_UserID ON [${flyway:defaultSchema}].[ReportUserState] ([UserID]);

/* Base View SQL for MJ: AI Vendor Type Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: vwAIVendorTypeDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Vendor Type Definitions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIVendorTypeDefinition
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIVendorTypeDefinitions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIVendorTypeDefinitions]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendorTypeDefinitions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Vendor Type Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: Permissions for vwAIVendorTypeDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendorTypeDefinitions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Vendor Type Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: spCreateAIVendorTypeDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIVendorTypeDefinition
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIVendorTypeDefinition]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIVendorTypeDefinition]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @newId UNIQUEIDENTIFIER = NEWID();
    SET @ID = @newId;

    INSERT INTO
    [${flyway:defaultSchema}].[AIVendorTypeDefinition]
        (
            [Name],
            [Description],
            [ID]
        )
    VALUES
        (
            @Name,
            @Description,
            @newId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIVendorTypeDefinitions] WHERE [ID] = @newId
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendorTypeDefinition] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Vendor Type Definitions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendorTypeDefinition] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Vendor Type Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: spUpdateAIVendorTypeDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIVendorTypeDefinition
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIVendorTypeDefinition]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIVendorTypeDefinition]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendorTypeDefinition]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIVendorTypeDefinitions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendorTypeDefinition] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIVendorTypeDefinition table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIVendorTypeDefinition
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIVendorTypeDefinition
ON [${flyway:defaultSchema}].[AIVendorTypeDefinition]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendorTypeDefinition]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Vendor Type Definitions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendorTypeDefinition] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Vendor Type Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: spDeleteAIVendorTypeDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendorTypeDefinition
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIVendorTypeDefinition]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIVendorTypeDefinition]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIVendorTypeDefinition]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendorTypeDefinition] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Vendor Type Definitions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendorTypeDefinition] TO [cdp_Integration]



/* Base View SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: vwReportUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report User States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportUserState
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportUserStates]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportUserStates]
AS
SELECT
    r.*,
    Report_ReportID.[Name] AS [Report],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ReportUserState] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: Permissions for vwReportUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spCreateReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportUserState]
    @ReportID uniqueidentifier,
    @UserID uniqueidentifier,
    @ReportState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportUserState]
        (
            [ReportID],
            [UserID],
            [ReportState]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ReportID,
            @UserID,
            @ReportState
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportUserStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportUserState] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportUserState] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spUpdateReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportUserState]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @UserID uniqueidentifier,
    @ReportState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportUserState]
    SET
        [ReportID] = @ReportID,
        [UserID] = @UserID,
        [ReportState] = @ReportState
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportUserStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportUserState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ReportUserState table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportUserState
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportUserState
ON [${flyway:defaultSchema}].[ReportUserState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportUserState]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportUserState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportUserState] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spDeleteReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportUserState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportUserState]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportUserState] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportUserState] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID B30005CE-FA92-4DEE-8F56-BEFC7D5E2AAE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B30005CE-FA92-4DEE-8F56-BEFC7D5E2AAE',
         @RelatedEntityNameFieldMap='Vendor'

/* Base View SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelVendors]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelVendors]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor]
FROM
    [${flyway:defaultSchema}].[AIModelVendor] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelVendor]
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModelVendor]
        (
            [ModelID],
            [VendorID],
            [Priority],
            [Status],
            [DriverClass],
            [DriverImportPath],
            [APIName],
            [MaxInputTokens],
            [MaxOutputTokens],
            [SupportedResponseFormats],
            [SupportsEffortLevel],
            [SupportsStreaming]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ModelID,
            @VendorID,
            @Priority,
            @Status,
            @DriverClass,
            @DriverImportPath,
            @APIName,
            @MaxInputTokens,
            @MaxOutputTokens,
            @SupportedResponseFormats,
            @SupportsEffortLevel,
            @SupportsStreaming
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelVendor]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [Priority] = @Priority,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [MaxInputTokens] = @MaxInputTokens,
        [MaxOutputTokens] = @MaxOutputTokens,
        [SupportedResponseFormats] = @SupportedResponseFormats,
        [SupportsEffortLevel] = @SupportsEffortLevel,
        [SupportsStreaming] = @SupportsStreaming
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelVendor table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelVendor
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelVendor
ON [${flyway:defaultSchema}].[AIModelVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelVendor]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]



/* Index for Foreign Keys for ArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for AIVendorType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key VendorID in table AIVendorType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendorType_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendorType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendorType_VendorID ON [${flyway:defaultSchema}].[AIVendorType] ([VendorID]);

-- Index for foreign key TypeID in table AIVendorType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendorType_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendorType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendorType_TypeID ON [${flyway:defaultSchema}].[AIVendorType] ([TypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 5E4E4059-4879-49C3-8BEC-61864B15D90B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5E4E4059-4879-49C3-8BEC-61864B15D90B',
         @RelatedEntityNameFieldMap='Vendor'

/* Index for Foreign Keys for ConversationArtifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifact_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifact_ConversationID ON [${flyway:defaultSchema}].[ConversationArtifact] ([ConversationID]);

-- Index for foreign key ArtifactTypeID in table ConversationArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifact_ArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifact_ArtifactTypeID ON [${flyway:defaultSchema}].[ConversationArtifact] ([ArtifactTypeID]);

/* Index for Foreign Keys for AIAgentPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPrompt_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPrompt_AgentID ON [${flyway:defaultSchema}].[AIAgentPrompt] ([AgentID]);

-- Index for foreign key PromptID in table AIAgentPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPrompt_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPrompt_PromptID ON [${flyway:defaultSchema}].[AIAgentPrompt] ([PromptID]);

-- Index for foreign key ConfigurationID in table AIAgentPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPrompt_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPrompt_ConfigurationID ON [${flyway:defaultSchema}].[AIAgentPrompt] ([ConfigurationID]);

/* SQL text to update entity field related entity name field map for entity field ID 4AD38EA9-178A-4E9E-BE99-3856111947EE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4AD38EA9-178A-4E9E-BE99-3856111947EE',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID 52B9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='52B9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* Base View SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifactTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactTypes]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[ArtifactType] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @newId UNIQUEIDENTIFIER = NEWID();
    SET @ID = @newId;

    INSERT INTO
    [${flyway:defaultSchema}].[ArtifactType]
        (
            [Name],
            [Description],
            [ContentType],
            [IsEnabled],
            [ID]
        )
    VALUES
        (
            @Name,
            @Description,
            @ContentType,
            @IsEnabled,
            @newId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = @newId
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentType] = @ContentType,
        [IsEnabled] = @IsEnabled
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifactType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]



/* Base View SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: vwConversationArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifacts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifacts]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    ArtifactType_ArtifactTypeID.[Name] AS [ArtifactType]
FROM
    [${flyway:defaultSchema}].[ConversationArtifact] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ArtifactTypeID
  ON
    [c].[ArtifactTypeID] = ArtifactType_ArtifactTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: Permissions for vwConversationArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spCreateConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifact]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @SharingScope nvarchar(50),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifact]
        (
            [Name],
            [Description],
            [ConversationID],
            [ArtifactTypeID],
            [SharingScope],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ConversationID,
            @ArtifactTypeID,
            @SharingScope,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spUpdateConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifact]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @SharingScope nvarchar(50),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifact]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ConversationID] = @ConversationID,
        [ArtifactTypeID] = @ArtifactTypeID,
        [SharingScope] = @SharingScope,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifact table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifact
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifact
ON [${flyway:defaultSchema}].[ConversationArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID EABE64E2-71E0-446A-9743-7D602D7EB36B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EABE64E2-71E0-446A-9743-7D602D7EB36B',
         @RelatedEntityNameFieldMap='Type'

/* SQL text to update entity field related entity name field map for entity field ID F304B5EA-2C56-45EE-AE0C-6EC0F0D219B6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F304B5EA-2C56-45EE-AE0C-6EC0F0D219B6',
         @RelatedEntityNameFieldMap='Prompt'

/* Base View SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: vwAIVendorTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Vendor Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIVendorType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIVendorTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIVendorTypes]
AS
SELECT
    a.*,
    AIVendor_VendorID.[Name] AS [Vendor],
    AIVendorTypeDefinition_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIVendorType] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS AIVendorTypeDefinition_TypeID
  ON
    [a].[TypeID] = AIVendorTypeDefinition_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendorTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: Permissions for vwAIVendorTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendorTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spCreateAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIVendorType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIVendorType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIVendorType]
    @VendorID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Rank int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIVendorType]
        (
            [VendorID],
            [TypeID],
            [Rank],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @VendorID,
            @TypeID,
            @Rank,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIVendorTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendorType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Vendor Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendorType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spUpdateAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIVendorType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIVendorType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIVendorType]
    @ID uniqueidentifier,
    @VendorID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Rank int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendorType]
    SET
        [VendorID] = @VendorID,
        [TypeID] = @TypeID,
        [Rank] = @Rank,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIVendorTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendorType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIVendorType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIVendorType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIVendorType
ON [${flyway:defaultSchema}].[AIVendorType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendorType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIVendorType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Vendor Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendorType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spDeleteAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendorType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIVendorType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIVendorType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIVendorType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendorType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Vendor Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendorType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 835A1FB1-9184-4EC8-B823-8960FE07545E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='835A1FB1-9184-4EC8-B823-8960FE07545E',
         @RelatedEntityNameFieldMap='Configuration'

/* Base View SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: vwAIAgentPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentPrompts]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIAgentPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentPrompts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: Permissions for vwAIAgentPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentPrompts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spCreateAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentPrompt]
    @AgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @Purpose nvarchar(MAX),
    @ExecutionOrder int,
    @ConfigurationID uniqueidentifier,
    @Status nvarchar(20),
    @ContextBehavior nvarchar(50),
    @ContextMessageCount int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentPrompt]
        (
            [AgentID],
            [PromptID],
            [Purpose],
            [ExecutionOrder],
            [ConfigurationID],
            [Status],
            [ContextBehavior],
            [ContextMessageCount]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @PromptID,
            @Purpose,
            @ExecutionOrder,
            @ConfigurationID,
            @Status,
            @ContextBehavior,
            @ContextMessageCount
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spUpdateAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentPrompt]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @Purpose nvarchar(MAX),
    @ExecutionOrder int,
    @ConfigurationID uniqueidentifier,
    @Status nvarchar(20),
    @ContextBehavior nvarchar(50),
    @ContextMessageCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentPrompt]
    SET
        [AgentID] = @AgentID,
        [PromptID] = @PromptID,
        [Purpose] = @Purpose,
        [ExecutionOrder] = @ExecutionOrder,
        [ConfigurationID] = @ConfigurationID,
        [Status] = @Status,
        [ContextBehavior] = @ContextBehavior,
        [ContextMessageCount] = @ContextMessageCount
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentPrompt
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentPrompt
ON [${flyway:defaultSchema}].[AIAgentPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentPrompt]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spDeleteAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 6DB9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6DB9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 82B9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='82B9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID C1B9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C1B9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 70B9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='70B9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 73B9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='73B9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID F7B9433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F7B9433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 1BBA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1BBA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 2DBA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2DBA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 00BA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='00BA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 03BA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='03BA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 06BA433E-F36B-1410-8DAB-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='06BA433E-F36B-1410-8DAB-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for GeneratedCode */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table GeneratedCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCode_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCode_CategoryID ON [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID]);

-- Index for foreign key GeneratedByModelID in table GeneratedCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCode_GeneratedByModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCode_GeneratedByModelID ON [${flyway:defaultSchema}].[GeneratedCode] ([GeneratedByModelID]);

-- Index for foreign key LinkedEntityID in table GeneratedCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCode_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCode_LinkedEntityID ON [${flyway:defaultSchema}].[GeneratedCode] ([LinkedEntityID]);

/* Index for Foreign Keys for AIPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID ON [${flyway:defaultSchema}].[AIPromptRun] ([VendorID]);

-- Index for foreign key AgentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptRun] ([ConfigurationID]);

/* SQL text to update entity field related entity name field map for entity field ID 9407CD9F-EB55-4BB5-8CDD-5D2E70D9D739 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9407CD9F-EB55-4BB5-8CDD-5D2E70D9D739',
         @RelatedEntityNameFieldMap='Prompt'

/* Index for Foreign Keys for ConversationArtifactPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationArtifactID in table ConversationArtifactPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifactPermission_ConversationArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifactPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifactPermission_ConversationArtifactID ON [${flyway:defaultSchema}].[ConversationArtifactPermission] ([ConversationArtifactID]);

/* Index for Foreign Keys for ReportVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReportID in table ReportVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportVersion_ReportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportVersion_ReportID ON [${flyway:defaultSchema}].[ReportVersion] ([ReportID]);

/* Base View SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: vwGeneratedCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Generated Codes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeneratedCode
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwGeneratedCodes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeneratedCodes]
AS
SELECT
    g.*,
    GeneratedCodeCategory_CategoryID.[Name] AS [Category],
    AIModel_GeneratedByModelID.[Name] AS [GeneratedByModel],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity]
FROM
    [${flyway:defaultSchema}].[GeneratedCode] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS GeneratedCodeCategory_CategoryID
  ON
    [g].[CategoryID] = GeneratedCodeCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_GeneratedByModelID
  ON
    [g].[GeneratedByModelID] = AIModel_GeneratedByModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [g].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: Permissions for vwGeneratedCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: spCreateGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeneratedCode
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateGeneratedCode]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeneratedCode]
    @GeneratedAt datetimeoffset,
    @CategoryID uniqueidentifier,
    @GeneratedByModelID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Code nvarchar(MAX),
    @Source nvarchar(MAX),
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordPrimaryKey nvarchar(MAX),
    @Status nvarchar(20),
    @Language nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[GeneratedCode]
        (
            [GeneratedAt],
            [CategoryID],
            [GeneratedByModelID],
            [Name],
            [Description],
            [Code],
            [Source],
            [LinkedEntityID],
            [LinkedRecordPrimaryKey],
            [Status],
            [Language]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @GeneratedAt,
            @CategoryID,
            @GeneratedByModelID,
            @Name,
            @Description,
            @Code,
            @Source,
            @LinkedEntityID,
            @LinkedRecordPrimaryKey,
            @Status,
            @Language
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeneratedCodes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCode] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Generated Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCode] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: spUpdateGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeneratedCode
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateGeneratedCode]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeneratedCode]
    @ID uniqueidentifier,
    @GeneratedAt datetimeoffset,
    @CategoryID uniqueidentifier,
    @GeneratedByModelID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Code nvarchar(MAX),
    @Source nvarchar(MAX),
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordPrimaryKey nvarchar(MAX),
    @Status nvarchar(20),
    @Language nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCode]
    SET
        [GeneratedAt] = @GeneratedAt,
        [CategoryID] = @CategoryID,
        [GeneratedByModelID] = @GeneratedByModelID,
        [Name] = @Name,
        [Description] = @Description,
        [Code] = @Code,
        [Source] = @Source,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordPrimaryKey] = @LinkedRecordPrimaryKey,
        [Status] = @Status,
        [Language] = @Language
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeneratedCodes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCode] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeneratedCode table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateGeneratedCode
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeneratedCode
ON [${flyway:defaultSchema}].[GeneratedCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCode]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeneratedCode] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Generated Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCode] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: spDeleteGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCode
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteGeneratedCode]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeneratedCode]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeneratedCode]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCode] TO [cdp_Integration]
    

/* spDelete Permissions for Generated Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCode] TO [cdp_Integration]



/* Base View SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: vwConversationArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifactPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
AS
SELECT
    c.*,
    ConversationArtifact_ConversationArtifactID.[Name] AS [ConversationArtifact]
FROM
    [${flyway:defaultSchema}].[ConversationArtifactPermission] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ConversationArtifactID
  ON
    [c].[ConversationArtifactID] = ConversationArtifact_ConversationArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: Permissions for vwConversationArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spCreateConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifactPermission]
    @ConversationArtifactID uniqueidentifier,
    @UserID uniqueidentifier,
    @AccessLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifactPermission]
        (
            [ConversationArtifactID],
            [UserID],
            [AccessLevel]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConversationArtifactID,
            @UserID,
            @AccessLevel
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifactPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spUpdateConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission]
    @ID uniqueidentifier,
    @ConversationArtifactID uniqueidentifier,
    @UserID uniqueidentifier,
    @AccessLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    SET
        [ConversationArtifactID] = @ConversationArtifactID,
        [UserID] = @UserID,
        [AccessLevel] = @AccessLevel
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactPermission table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifactPermission
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifactPermission
ON [${flyway:defaultSchema}].[ConversationArtifactPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifactPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spDeleteConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] TO [cdp_Integration]



/* Base View SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: vwReportVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportVersions]
AS
SELECT
    r.*,
    Report_ReportID.[Name] AS [Report]
FROM
    [${flyway:defaultSchema}].[ReportVersion] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: Permissions for vwReportVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spCreateReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportVersion]
    @ReportID uniqueidentifier,
    @VersionNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @DataContextUpdated bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportVersion]
        (
            [ReportID],
            [VersionNumber],
            [Name],
            [Description],
            [Configuration],
            [DataContextUpdated]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ReportID,
            @VersionNumber,
            @Name,
            @Description,
            @Configuration,
            @DataContextUpdated
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spUpdateReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportVersion]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @VersionNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @DataContextUpdated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportVersion]
    SET
        [ReportID] = @ReportID,
        [VersionNumber] = @VersionNumber,
        [Name] = @Name,
        [Description] = @Description,
        [Configuration] = @Configuration,
        [DataContextUpdated] = @DataContextUpdated
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ReportVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportVersion
ON [${flyway:defaultSchema}].[ReportVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spDeleteReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportVersion]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportVersion] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 71548843-FAAA-493F-A7D3-FDCB4A3A80DF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='71548843-FAAA-493F-A7D3-FDCB4A3A80DF',
         @RelatedEntityNameFieldMap='Model'

/* SQL text to update entity field related entity name field map for entity field ID F4E86C22-D315-4DB1-9DA1-A5779B78EAAC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F4E86C22-D315-4DB1-9DA1-A5779B78EAAC',
         @RelatedEntityNameFieldMap='Vendor'

/* SQL text to update entity field related entity name field map for entity field ID C1D2EC52-E3DE-46E1-A7B7-C353C811E74C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C1D2EC52-E3DE-46E1-A7B7-C353C811E74C',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID FE9C78CB-14F9-4F2D-85A1-51860E35C95B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FE9C78CB-14F9-4F2D-85A1-51860E35C95B',
         @RelatedEntityNameFieldMap='Configuration'

/* Base View SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPromptRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetime2,
    @CompletedAt datetime2,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPromptRun]
        (
            [PromptID],
            [ModelID],
            [VendorID],
            [AgentID],
            [ConfigurationID],
            [RunAt],
            [CompletedAt],
            [ExecutionTimeMS],
            [Messages],
            [Result],
            [TokensUsed],
            [TokensPrompt],
            [TokensCompletion],
            [TotalCost],
            [Success],
            [ErrorMessage]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @PromptID,
            @ModelID,
            @VendorID,
            @AgentID,
            @ConfigurationID,
            @RunAt,
            @CompletedAt,
            @ExecutionTimeMS,
            @Messages,
            @Result,
            @TokensUsed,
            @TokensPrompt,
            @TokensCompletion,
            @TotalCost,
            @Success,
            @ErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetime2,
    @CompletedAt datetime2,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [RunAt] = @RunAt,
        [CompletedAt] = @CompletedAt,
        [ExecutionTimeMS] = @ExecutionTimeMS,
        [Messages] = @Messages,
        [Result] = @Result,
        [TokensUsed] = @TokensUsed,
        [TokensPrompt] = @TokensPrompt,
        [TokensCompletion] = @TokensCompletion,
        [TotalCost] = @TotalCost,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPromptRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRun
ON [${flyway:defaultSchema}].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Integration]



/* Index for Foreign Keys for AIConfigurationParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConfigurationID in table AIConfigurationParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfigurationParam_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfigurationParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfigurationParam_ConfigurationID ON [${flyway:defaultSchema}].[AIConfigurationParam] ([ConfigurationID]);

/* SQL text to update entity field related entity name field map for entity field ID 9CEB2C06-16DA-4D02-B575-499F97E9B2C6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9CEB2C06-16DA-4D02-B575-499F97E9B2C6',
         @RelatedEntityNameFieldMap='Configuration'

/* Base View SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: vwAIConfigurationParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configuration Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIConfigurationParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIConfigurationParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurationParams]
AS
SELECT
    a.*,
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIConfigurationParam] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurationParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: Permissions for vwAIConfigurationParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurationParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spCreateAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIConfigurationParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfigurationParam]
    @ConfigurationID uniqueidentifier,
    @Name nvarchar(100),
    @Type nvarchar(20),
    @Value nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIConfigurationParam]
        (
            [ConfigurationID],
            [Name],
            [Type],
            [Value],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConfigurationID,
            @Name,
            @Type,
            @Value,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIConfigurationParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Configuration Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spUpdateAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIConfigurationParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfigurationParam]
    @ID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Name nvarchar(100),
    @Type nvarchar(20),
    @Value nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfigurationParam]
    SET
        [ConfigurationID] = @ConfigurationID,
        [Name] = @Name,
        [Type] = @Type,
        [Value] = @Value,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIConfigurationParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfigurationParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIConfigurationParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIConfigurationParam
ON [${flyway:defaultSchema}].[AIConfigurationParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfigurationParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIConfigurationParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Configuration Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spDeleteAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIConfigurationParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfigurationParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfigurationParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configuration Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '335add17-b5d8-4702-ad59-fc2c287f119b'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultPromptForContextCompression')
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
            '335add17-b5d8-4702-ad59-fc2c287f119b',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            10,
            'DefaultPromptForContextCompression',
            'Default Prompt For Context Compression',
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
         WHERE ID = '6ab184fd-b925-4533-b2f9-6ff29030d036'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultPromptForContextSummarization')
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
            '6ab184fd-b925-4533-b2f9-6ff29030d036',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            11,
            'DefaultPromptForContextSummarization',
            'Default Prompt For Context Summarization',
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
         WHERE ID = '52e74c81-d246-4b52-b7a7-91757c299671'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'Parent')
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
            '52e74c81-d246-4b52-b7a7-91757c299671',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            15,
            'Parent',
            'Parent',
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
         WHERE ID = 'ad36ef69-1494-409c-a97e-fe73669dd28a'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'ContextCompressionPrompt')
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
            'ad36ef69-1494-409c-a97e-fe73669dd28a',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            16,
            'ContextCompressionPrompt',
            'Context Compression Prompt',
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
         WHERE ID = 'c6428612-640b-4573-b3ff-5b242e616b7e'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Prompt')
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
            'c6428612-640b-4573-b3ff-5b242e616b7e',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            15,
            'Prompt',
            'Prompt',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = 'd2395fd4-050c-44a6-bc12-768b200c82e0'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Model')
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
            'd2395fd4-050c-44a6-bc12-768b200c82e0',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            16,
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = '3d9cda2c-fdcc-4db3-b7aa-e989d6348654'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Vendor')
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
            '3d9cda2c-fdcc-4db3-b7aa-e989d6348654',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            17,
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '35ec6612-1c62-4401-b4b5-fd4e1f67b4d3'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Configuration')
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
            '35ec6612-1c62-4401-b4b5-fd4e1f67b4d3',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            18,
            'Configuration',
            'Configuration',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9aeebde0-1200-48a2-83fe-58a9a566e57a'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'AIModelType')
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
            '9aeebde0-1200-48a2-83fe-58a9a566e57a',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            37,
            'AIModelType',
            'AI Model Type',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '10eee5b8-b577-4f8b-9102-afcce345086a'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ResultSelectorPrompt')
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
            '10eee5b8-b577-4f8b-9102-afcce345086a',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            38,
            'ResultSelectorPrompt',
            'Result Selector Prompt',
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
         WHERE ID = '750a856a-8e2a-4161-ae35-0a311266d2ea'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'Vendor')
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
            '750a856a-8e2a-4161-ae35-0a311266d2ea',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            18,
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '0b216dca-0eb9-42e3-942f-8c74960c2cd5'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'Agent')
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
            '0b216dca-0eb9-42e3-942f-8c74960c2cd5',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            19,
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
         WHERE ID = '48c4211a-cf59-45be-b2f1-ef59fd5d2050'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'Configuration')
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
            '48c4211a-cf59-45be-b2f1-ef59fd5d2050',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            20,
            'Configuration',
            'Configuration',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ea94d7b8-080d-4525-b0e9-6e620b3e901e'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'Model')
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
            'ea94d7b8-080d-4525-b0e9-6e620b3e901e',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            16,
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = 'fbd754c7-2336-494c-9e4f-f3a6eaddb575'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'Vendor')
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
            'fbd754c7-2336-494c-9e4f-f3a6eaddb575',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            17,
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = '77ef7786-ff0d-44e4-b83b-418ce444cc19'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'Vendor')
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
            '77ef7786-ff0d-44e4-b83b-418ce444cc19',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            8,
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = '87e69fa6-922b-4ad5-82cd-eb8f49523981'  OR 
               (EntityID = 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F' AND Name = 'Type')
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
            '87e69fa6-922b-4ad5-82cd-eb8f49523981',
            'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', -- Entity: MJ: AI Vendor Types
            9,
            'Type',
            'Type',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = 'd744ec4e-9f2a-48e0-abb1-bdcdbea59348'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'Agent')
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
            'd744ec4e-9f2a-48e0-abb1-bdcdbea59348',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            12,
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
         WHERE ID = '56397dc7-ced1-4af9-aa07-2e8023e90c39'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'Prompt')
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
            '56397dc7-ced1-4af9-aa07-2e8023e90c39',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            13,
            'Prompt',
            'Prompt',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = 'c9b64b47-2f77-42f7-8674-6ef8b75f1248'  OR 
               (EntityID = '094CD426-12FF-4B26-A94B-9AC23C5829A0' AND Name = 'Configuration')
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
            'c9b64b47-2f77-42f7-8674-6ef8b75f1248',
            '094CD426-12FF-4B26-A94B-9AC23C5829A0', -- Entity: MJ: AI Agent Prompts
            14,
            'Configuration',
            'Configuration',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e114b8eb-89a2-4ef2-a45e-0d52e011fcce'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Prompt')
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
            'e114b8eb-89a2-4ef2-a45e-0d52e011fcce',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            20,
            'Prompt',
            'Prompt',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = '5603b884-25a8-4d10-94a3-636e59f3e91c'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Model')
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
            '5603b884-25a8-4d10-94a3-636e59f3e91c',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            21,
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = 'f1d62eee-feef-4d0c-8955-7ab4442a9150'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Vendor')
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
            'f1d62eee-feef-4d0c-8955-7ab4442a9150',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            22,
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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
         WHERE ID = '2de35331-2554-4e99-8c8e-2fb392b3b658'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Agent')
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
            '2de35331-2554-4e99-8c8e-2fb392b3b658',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            23,
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
         WHERE ID = 'f7a51776-f0c9-4411-9481-e46dc3ee9d4f'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'Configuration')
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
            'f7a51776-f0c9-4411-9481-e46dc3ee9d4f',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            24,
            'Configuration',
            'Configuration',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7c3c782d-f37b-4b7e-9a17-b3adaf2dfa39'  OR 
               (EntityID = '02B2ECDF-FC92-4D19-B332-F840EA708565' AND Name = 'Configuration')
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
            '7c3c782d-f37b-4b7e-9a17-b3adaf2dfa39',
            '02B2ECDF-FC92-4D19-B332-F840EA708565', -- Entity: MJ: AI Configuration Params
            9,
            'Configuration',
            'Configuration',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
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

-- CHECK constraint for AI Agents: Field: ExecutionMode was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ExecutionMode]=N''Parallel'' OR [ExecutionMode]=N''Sequential'')', 'public ValidateExecutionModeAllowedValues(result: ValidationResult) {
	if (this.ExecutionMode !== "Parallel" && this.ExecutionMode !== "Sequential") {
		result.Errors.push(new ValidationErrorInfo("ExecutionMode", "ExecutionMode must be either ''Parallel'' or ''Sequential''.", this.ExecutionMode, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the ExecutionMode field must be either ''Parallel'' or ''Sequential''. No other values are allowed.', 'ValidateExecutionModeAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8261D630-2560-4C03-BE14-C8A9682ABBB4');
  
            -- CHECK constraint for AI Agents @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParentID] IS NULL OR [ExposeAsAction]=(0))', 'public ValidateParentIDMustBeNullIfExposeAsActionTrue(result: ValidationResult) {
	if (this.ParentID !== null && this.ExposeAsAction) {
		result.Errors.push(new ValidationErrorInfo("ParentID", "ParentID must be empty if this item is exposed as an action.", this.ParentID, ValidationErrorType.Failure));
	}
}', 'This rule makes sure that if the ParentID is set (not empty), then the ExposeAsAction option must be disabled. If ExposeAsAction is enabled, ParentID must be empty.', 'ValidateParentIDMustBeNullIfExposeAsActionTrue', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1');
  
            -- CHECK constraint for AI Agents @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([EnableContextCompression]=(0) OR [ContextCompressionMessageThreshold] IS NOT NULL AND [ContextCompressionPromptID] IS NOT NULL AND [ContextCompressionMessageRetentionCount] IS NOT NULL)', 'public ValidateEnableContextCompressionRequiresContextFields(result: ValidationResult) {
	if (this.EnableContextCompression) {
		if (this.ContextCompressionMessageThreshold === null) {
			result.Errors.push(new ValidationErrorInfo("ContextCompressionMessageThreshold", "Context compression is enabled, so the context compression message threshold is required.", this.ContextCompressionMessageThreshold, ValidationErrorType.Failure));
		}
		if (this.ContextCompressionPromptID === null) {
			result.Errors.push(new ValidationErrorInfo("ContextCompressionPromptID", "Context compression is enabled, so the context compression prompt ID is required.", this.ContextCompressionPromptID, ValidationErrorType.Failure));
		}
		if (this.ContextCompressionMessageRetentionCount === null) {
			result.Errors.push(new ValidationErrorInfo("ContextCompressionMessageRetentionCount", "Context compression is enabled, so the context compression message retention count is required.", this.ContextCompressionMessageRetentionCount, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that if context compression is enabled, all related settings (message threshold, prompt ID, and message retention count) must be specified. If context compression is not enabled, these settings may be left unspecified.', 'ValidateEnableContextCompressionRequiresContextFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1');
  
            

-- CHECK constraint for AI Prompts: Field: CacheMatchType was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CacheMatchType]=N''Vector'' OR [CacheMatchType]=N''Exact'')', 'public ValidateCacheMatchTypeIsVectorOrExact(result: ValidationResult) {
	if (this.CacheMatchType !== "Vector" && this.CacheMatchType !== "Exact") {
		result.Errors.push(new ValidationErrorInfo("CacheMatchType", "Cache match type must be either ''Vector'' or ''Exact''.", this.CacheMatchType, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the cache match type can only be set to ''Vector'' or ''Exact''. No other value is allowed.', 'ValidateCacheMatchTypeIsVectorOrExact', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B007D2D5-549E-4688-B48D-8EDD2C5075D4');
  
            -- CHECK constraint for AI Prompts: Field: CacheTTLSeconds was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CacheTTLSeconds] IS NULL OR [CacheTTLSeconds]>(0))', 'public ValidateCacheTTLSecondsGreaterThanZero(result: ValidationResult) {
	if (this.CacheTTLSeconds !== null && this.CacheTTLSeconds <= 0) {
		result.Errors.push(new ValidationErrorInfo("CacheTTLSeconds", "If cache expiration time (CacheTTLSeconds) is specified, it must be greater than zero.", this.CacheTTLSeconds, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the cache expiration time in seconds is provided, it must be greater than zero.', 'ValidateCacheTTLSecondsGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '32FC4550-A54F-453A-9855-65760AD3C4A8');
  
            -- CHECK constraint for AI Prompts: Field: CacheSimilarityThreshold was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CacheSimilarityThreshold] IS NULL OR [CacheSimilarityThreshold]>=(0) AND [CacheSimilarityThreshold]<=(1))', 'public ValidateCacheSimilarityThresholdIsBetweenZeroAndOne(result: ValidationResult) {
	if (this.CacheSimilarityThreshold !== null && (this.CacheSimilarityThreshold < 0 || this.CacheSimilarityThreshold > 1)) {
		result.Errors.push(new ValidationErrorInfo("CacheSimilarityThreshold", "Cache similarity threshold must be between 0 and 1.", this.CacheSimilarityThreshold, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a cache similarity threshold is provided, it must be a value between 0 and 1, inclusive. If no value is provided, that''s also allowed.', 'ValidateCacheSimilarityThresholdIsBetweenZeroAndOne', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F8C70016-D404-4D8F-BBFB-F36D62CD1FE3');
  
            -- CHECK constraint for AI Prompts @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParallelizationMode]<>''StaticCount'' OR [ParallelCount] IS NOT NULL)', 'public ValidateParallelCountWhenParallelizationModeIsStaticCount(result: ValidationResult) {
	if (this.ParallelizationMode === "StaticCount" && this.ParallelCount === null) {
		result.Errors.push(new ValidationErrorInfo("ParallelCount", "When ParallelizationMode is ''StaticCount'', ParallelCount must be specified.", this.ParallelCount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the parallelization mode is set to ''StaticCount'', then the number of parallel tasks (ParallelCount) must be provided.', 'ValidateParallelCountWhenParallelizationModeIsStaticCount', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539');
  
            -- CHECK constraint for AI Prompts: Field: SelectionStrategy was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([SelectionStrategy]=N''ByPower'' OR [SelectionStrategy]=N''Specific'' OR [SelectionStrategy]=N''Default'')', 'public ValidateSelectionStrategyAgainstAllowedValues(result: ValidationResult) {
	const allowedValues = ["ByPower", "Specific", "Default"];
	if (!allowedValues.includes(this.SelectionStrategy)) {
		result.Errors.push(new ValidationErrorInfo("SelectionStrategy", "SelectionStrategy must be either ''ByPower'', ''Specific'', or ''Default''.", this.SelectionStrategy, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the SelectionStrategy field must be set to either ''ByPower'', ''Specific'', or ''Default''.', 'ValidateSelectionStrategyAgainstAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A014DE78-5FB6-4114-AC50-40739A24E122');
  
            -- CHECK constraint for AI Prompts: Field: RetryStrategy was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([RetryStrategy]=N''Linear'' OR [RetryStrategy]=N''Exponential'' OR [RetryStrategy]=N''Fixed'')', 'public ValidateRetryStrategyIsAllowedValue(result: ValidationResult) {
	const allowed = ["Linear", "Exponential", "Fixed"];
	if (this.RetryStrategy && !allowed.includes(this.RetryStrategy)) {
		result.Errors.push(new ValidationErrorInfo("RetryStrategy", "RetryStrategy must be one of the following values: ''Linear'', ''Exponential'', or ''Fixed''.", this.RetryStrategy, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the RetryStrategy field can only be set to one of the following values: ''Linear'', ''Exponential'', or ''Fixed''.', 'ValidateRetryStrategyIsAllowedValue', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0049EE44-5535-4D29-9CE2-2522E5BCD811');
  
            -- CHECK constraint for AI Prompts @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParallelizationMode]<>''ConfigParam'' OR [ParallelConfigParam] IS NOT NULL)', 'public ValidateParallelConfigParamRequiredForConfigParamMode(result: ValidationResult) {
	if (this.ParallelizationMode === "ConfigParam" && this.ParallelConfigParam === null) {
		result.Errors.push(new ValidationErrorInfo("ParallelConfigParam", "Parallel Config Param must be entered when Parallelization Mode is set to ''ConfigParam''.", this.ParallelConfigParam, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the Parallelization Mode is set to ''ConfigParam'', then the Parallel Config Param field must be filled in. For any other mode, the Parallel Config Param can be left empty.', 'ValidateParallelConfigParamRequiredForConfigParamMode', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539');
  
            -- CHECK constraint for AI Prompts: Field: PowerPreference was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([PowerPreference]=N''Balanced'' OR [PowerPreference]=N''Lowest'' OR [PowerPreference]=N''Highest'')', 'public ValidatePowerPreferenceAllowedValues(result: ValidationResult) {
	const allowed = ["Balanced", "Lowest", "Highest"];
	if (this.PowerPreference && !allowed.includes(this.PowerPreference)) {
		result.Errors.push(new ValidationErrorInfo("PowerPreference", "PowerPreference must be ''Balanced'', ''Lowest'', or ''Highest''.", this.PowerPreference, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the PowerPreference field can only be set to ''Balanced'', ''Lowest'', or ''Highest''. No other values are allowed.', 'ValidatePowerPreferenceAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A');
  
            -- CHECK constraint for AI Prompts: Field: ParallelizationMode was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParallelizationMode]=N''ModelSpecific'' OR [ParallelizationMode]=N''ConfigParam'' OR [ParallelizationMode]=N''StaticCount'' OR [ParallelizationMode]=N''None'')', 'public ValidateParallelizationModeAllowedValues(result: ValidationResult) {
	const allowedValues = ["ModelSpecific", "ConfigParam", "StaticCount", "None"];
	if (!allowedValues.includes(this.ParallelizationMode)) {
		result.Errors.push(new ValidationErrorInfo(
			"ParallelizationMode",
			"ParallelizationMode must be one of: ''ModelSpecific'', ''ConfigParam'', ''StaticCount'', or ''None''.",
			this.ParallelizationMode,
			ValidationErrorType.Failure
		));
	}
}', 'This rule ensures that the ParallelizationMode field can only be set to one of the following values: ''ModelSpecific'', ''ConfigParam'', ''StaticCount'', or ''None''.', 'ValidateParallelizationModeAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A93C0CBB-A329-4E92-90D8-471FF627D055');
  
            -- CHECK constraint for AI Prompts @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([OutputType]<>''object'' OR [OutputExample] IS NOT NULL)', 'public ValidateOutputExampleWhenOutputTypeObject(result: ValidationResult) {
	if (this.OutputType === "object" && (this.OutputExample === null || this.OutputExample === undefined)) {
		result.Errors.push(new ValidationErrorInfo("OutputExample", "When OutputType is ''object'', OutputExample must be provided.", this.OutputExample, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the OutputType is set to ''object'', an OutputExample must be provided. If the OutputType is anything other than ''object'', providing an OutputExample is not required.', 'ValidateOutputExampleWhenOutputTypeObject', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539');
  
            -- CHECK constraint for AI Prompts @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ResultSelectorPromptID]<>[ID])', 'public ValidateResultSelectorPromptIDNotEqualID(result: ValidationResult) {
	if (this.ResultSelectorPromptID === this.ID) {
		result.Errors.push(new ValidationErrorInfo("ResultSelectorPromptID", "The ResultSelectorPromptID cannot be the same as the ID. A result selector prompt cannot reference itself.", this.ResultSelectorPromptID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the ResultSelectorPromptID field must be different from the ID field. In other words, a result selector prompt cannot reference itself.', 'ValidateResultSelectorPromptIDNotEqualID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539');
  
            -- CHECK constraint for AI Prompts @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CacheMatchType]<>''Vector'' OR [CacheSimilarityThreshold] IS NOT NULL)', 'public ValidateCacheSimilarityThresholdRequiredForVectorCache(result: ValidationResult) {
	if (this.CacheMatchType === "Vector" && this.CacheSimilarityThreshold === null) {
		result.Errors.push(new ValidationErrorInfo("CacheSimilarityThreshold", "CacheSimilarityThreshold must be specified when CacheMatchType is ''Vector''.", this.CacheSimilarityThreshold, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the cache match type is set to ''Vector'', the cache similarity threshold must be specified. If the match type is anything other than ''Vector'', the similarity threshold can be left empty.', 'ValidateCacheSimilarityThresholdRequiredForVectorCache', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539');
  
            

-- CHECK constraint for MJ: AI Agent Prompts @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '(NOT ([ContextBehavior]=''InitialMessages'' OR [ContextBehavior]=''RecentMessages'') OR [ContextMessageCount] IS NOT NULL)', 'public ValidateContextMessageCountRequiredForCertainBehaviors(result: ValidationResult) {
	if ((this.ContextBehavior === "InitialMessages" || this.ContextBehavior === "RecentMessages") && this.ContextMessageCount === null) {
		result.Errors.push(new ValidationErrorInfo("ContextMessageCount", "ContextMessageCount must be specified when ContextBehavior is ''InitialMessages'' or ''RecentMessages''.", this.ContextMessageCount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the context behavior is set to ''InitialMessages'' or ''RecentMessages'', then the context message count must be provided. For all other context behaviors, the context message count can be left blank.', 'ValidateContextMessageCountRequiredForCertainBehaviors', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '094CD426-12FF-4B26-A94B-9AC23C5829A0');
  
            

-- CHECK constraint for MJ: AI Configuration Params: Field: Type was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Type]=N''object'' OR [Type]=N''date'' OR [Type]=N''boolean'' OR [Type]=N''number'' OR [Type]=N''string'')', 'public ValidateTypeAgainstAllowedValues(result: ValidationResult) {
	const allowedValues = ["object", "date", "boolean", "number", "string"];
	if (!allowedValues.includes(this.Type)) {
		result.Errors.push(new ValidationErrorInfo("Type", "Type must be one of: ''object'', ''date'', ''boolean'', ''number'', or ''string''.", this.Type, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Type field must be set to one of the following values: ''object'', ''date'', ''boolean'', ''number'', or ''string''. No other values are allowed.', 'ValidateTypeAgainstAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A68F157F-802A-433B-81A3-0B01ECC39C25');
  
            

-- CHECK constraint for MJ: AI Configurations: Field: Status was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Status]=N''Preview'' OR [Status]=N''Deprecated'' OR [Status]=N''Inactive'' OR [Status]=N''Active'')', 'public ValidateStatusAllowedValues(result: ValidationResult) {
	const allowedValues = ["Preview", "Deprecated", "Inactive", "Active"];
	if (!allowedValues.includes(this.Status)) {
		result.Errors.push(new ValidationErrorInfo("Status", "Status must be one of: ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''.", this.Status, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Status field can only have one of the following values: ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''. Any other value will not be accepted.', 'ValidateStatusAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601');
  
            

-- CHECK constraint for MJ: AI Model Vendors: Field: Priority was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Priority]>=(0))', 'public ValidatePriorityIsNonNegative(result: ValidationResult) {
	if (this.Priority < 0) {
		result.Errors.push(new ValidationErrorInfo("Priority", "Priority must be zero or greater.", this.Priority, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Priority value cannot be negative. It must be zero or greater.', 'ValidatePriorityIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '37BFE134-5935-4863-8B22-29EFE58B2150');
  
            -- CHECK constraint for MJ: AI Model Vendors: Field: MaxOutputTokens was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MaxOutputTokens] IS NULL OR [MaxOutputTokens]>=(0))', 'public ValidateMaxOutputTokensNotNegative(result: ValidationResult) {
	if (this.MaxOutputTokens !== null && this.MaxOutputTokens < 0) {
		result.Errors.push(new ValidationErrorInfo("MaxOutputTokens", "Max output tokens must be zero or greater.", this.MaxOutputTokens, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the maximum output tokens value must be zero or higher. If no value is provided, that''s also acceptable.', 'ValidateMaxOutputTokensNotNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'C5799595-5330-4762-BD3C-12F9CD02E933');
  
            -- CHECK constraint for MJ: AI Model Vendors: Field: Status was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Status]=N''Preview'' OR [Status]=N''Deprecated'' OR [Status]=N''Inactive'' OR [Status]=N''Active'')', 'public ValidateStatusAllowedValues(result: ValidationResult) {
	const allowedStatuses = ["Preview", "Deprecated", "Inactive", "Active"];
	if (this.Status !== null && !allowedStatuses.includes(this.Status)) {
		result.Errors.push(new ValidationErrorInfo("Status", "Status must be ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''.", this.Status, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the status value must be either "Preview", "Deprecated", "Inactive", or "Active". Other status values are not allowed.', 'ValidateStatusAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429');
  
            -- CHECK constraint for MJ: AI Model Vendors: Field: MaxInputTokens was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MaxInputTokens] IS NULL OR [MaxInputTokens]>=(0))', 'public ValidateMaxInputTokensNonNegative(result: ValidationResult) {
	if (this.MaxInputTokens !== null && this.MaxInputTokens < 0) {
		result.Errors.push(new ValidationErrorInfo("MaxInputTokens", "MaxInputTokens must be zero or a positive value if specified.", this.MaxInputTokens, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the MaxInputTokens field is specified, it must be zero or a positive number. It cannot be negative.', 'ValidateMaxInputTokensNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '20E5AFFE-1F52-478D-AD83-C5A0A90A2C4E');
  
            

-- CHECK constraint for MJ: AI Prompt Models: Field: Priority was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Priority]>=(0))', 'public ValidatePriorityIsNonNegative(result: ValidationResult) {
	if (this.Priority < 0) {
		result.Errors.push(new ValidationErrorInfo("Priority", "Priority must be greater than or equal to zero.", this.Priority, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Priority value must be greater than or equal to zero. Negative priorities are not allowed.', 'ValidatePriorityIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '4B8E1299-E3BF-4838-9D0F-A01F6883C063');
  
            -- CHECK constraint for MJ: AI Prompt Models: Field: ExecutionGroup was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ExecutionGroup]>=(0))', 'public ValidateExecutionGroupIsNonNegative(result: ValidationResult) {
	if (this.ExecutionGroup < 0) {
		result.Errors.push(new ValidationErrorInfo("ExecutionGroup", "ExecutionGroup must be zero or a positive number.", this.ExecutionGroup, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the ExecutionGroup value must be zero or a positive number. Negative numbers are not allowed.', 'ValidateExecutionGroupIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '29F49B56-B2F7-4D8B-9F4E-10713D61819C');
  
            -- CHECK constraint for MJ: AI Prompt Models: Field: Status was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Status]=N''Preview'' OR [Status]=N''Deprecated'' OR [Status]=N''Inactive'' OR [Status]=N''Active'')', 'public ValidateStatusIsLimitedToAllowedValues(result: ValidationResult) {
	const allowedStatuses = ["Preview", "Deprecated", "Inactive", "Active"];
	if (this.Status !== null && !allowedStatuses.includes(this.Status)) {
		result.Errors.push(new ValidationErrorInfo("Status", "The Status field must be one of: ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''.", this.Status, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the status can only be set to one of these values: ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''. No other values are allowed.', 'ValidateStatusIsLimitedToAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '70E7FF76-A99F-4886-AE7C-3DE0C620B4A5');
  
            -- CHECK constraint for MJ: AI Prompt Models: Field: ParallelCount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParallelCount]>=(1))', 'public ValidateParallelCountAtLeastOne(result: ValidationResult) {
	if (this.ParallelCount < 1) {
		result.Errors.push(new ValidationErrorInfo("ParallelCount", "ParallelCount must be at least 1.", this.ParallelCount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the number of parallel tasks (ParallelCount) must be at least 1. It cannot be zero or negative.', 'ValidateParallelCountAtLeastOne', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CCCEFDB1-E3B9-4A2F-821F-E2CB010BB237');
  
            -- CHECK constraint for MJ: AI Prompt Models: Field: ParallelizationMode was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParallelizationMode]=N''ConfigParam'' OR [ParallelizationMode]=N''StaticCount'' OR [ParallelizationMode]=N''None'')', 'public ValidateParallelizationModeAllowedValues(result: ValidationResult) {
	const validValues = ["ConfigParam", "StaticCount", "None"];
	if (this.ParallelizationMode !== null && !validValues.includes(this.ParallelizationMode)) {
		result.Errors.push(new ValidationErrorInfo("ParallelizationMode", "ParallelizationMode must be ''ConfigParam'', ''StaticCount'', or ''None''.", this.ParallelizationMode, ValidationErrorType.Failure));
	}
}', 'This rule makes sure that the ParallelizationMode field can only be set to one of three valid values: ''ConfigParam'', ''StaticCount'', or ''None''. No other values are allowed.', 'ValidateParallelizationModeAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'FEC78D56-641A-4866-9049-2F3684DF4592');
  
            -- CHECK constraint for MJ: AI Prompt Models @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ParallelizationMode]=''None'' OR [ParallelizationMode]=''StaticCount'' AND [ParallelConfigParam] IS NULL OR [ParallelizationMode]=''ConfigParam'' AND [ParallelConfigParam] IS NOT NULL)', 'public ValidateParallelConfigParamBasedOnParallelizationMode(result: ValidationResult) {
	if (
		(this.ParallelizationMode === "None" || this.ParallelizationMode === "StaticCount") &&
		this.ParallelConfigParam !== null
	) {
		result.Errors.push(new ValidationErrorInfo(
			"ParallelConfigParam",
			"ParallelConfigParam must be empty when ParallelizationMode is ''None'' or ''StaticCount''.",
			this.ParallelConfigParam,
			ValidationErrorType.Failure
		));
	} else if (
		this.ParallelizationMode === "ConfigParam" &&
		this.ParallelConfigParam === null
	) {
		result.Errors.push(new ValidationErrorInfo(
			"ParallelConfigParam",
			"ParallelConfigParam must be provided when ParallelizationMode is ''ConfigParam''.",
			this.ParallelConfigParam,
			ValidationErrorType.Failure
		));
	}
}', 'This rule ensures that if the parallelization mode is ''None'' or ''StaticCount'', then the parallel config parameter must be empty. If the parallelization mode is ''ConfigParam'', then the parallel config parameter must be provided.', 'ValidateParallelConfigParamBasedOnParallelizationMode', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'AD4D32AE-6848-41A0-A966-2A1F8B751251');
  
            

-- CHECK constraint for MJ: AI Prompt Runs @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CompletedAt] IS NULL OR [CompletedAt]>=[RunAt])', 'public ValidateCompletedAtIsNullOrAfterRunAt(result: ValidationResult) {
	if (this.CompletedAt !== null && this.CompletedAt < this.RunAt) {
		result.Errors.push(new ValidationErrorInfo("CompletedAt", "Completed date and time, if present, must not be earlier than the run start date and time.", this.CompletedAt, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the ''CompletedAt'' field has a value, it must be on or after the ''RunAt'' field. Otherwise, if ''CompletedAt'' is empty, there is no restriction.', 'ValidateCompletedAtIsNullOrAfterRunAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7C1C98D0-3978-4CE8-8E3F-C90301E59767');
  
            -- CHECK constraint for MJ: AI Prompt Runs @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([TokensPrompt] IS NULL AND [TokensCompletion] IS NULL OR [TokensUsed] IS NULL OR [TokensUsed]=([TokensPrompt]+[TokensCompletion]))', 'public ValidateTokensUsedSumMatchesPromptAndCompletion(result: ValidationResult) {
	if (
		!((this.TokensPrompt === null && this.TokensCompletion === null) ||
			this.TokensUsed === null ||
			(this.TokensPrompt !== null && this.TokensCompletion !== null && this.TokensUsed === (this.TokensPrompt + this.TokensCompletion))
		)
	) {
		result.Errors.push(new ValidationErrorInfo("TokensUsed", "TokensUsed must be equal to the sum of TokensPrompt and TokensCompletion, unless one or more of these values are NULL (except if TokensPrompt and TokensCompletion are both NULL).", this.TokensUsed, ValidationErrorType.Failure));
	}
}', 'This rule ensures that either both TokensPrompt and TokensCompletion are missing, or TokensUsed is missing, or, if all values are present, the value of TokensUsed equals the sum of TokensPrompt and TokensCompletion.', 'ValidateTokensUsedSumMatchesPromptAndCompletion', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7C1C98D0-3978-4CE8-8E3F-C90301E59767');
  
            

-- CHECK constraint for MJ: AI Vendor Types: Field: Rank was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Rank]>=(0))', 'public ValidateRankNonNegative(result: ValidationResult) {
	if (this.Rank < 0) {
		result.Errors.push(new ValidationErrorInfo("Rank", "Rank cannot be negative. It must be zero or higher.", this.Rank, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Rank value cannot be negative; it must be zero or higher.', 'ValidateRankNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'D12E9415-E8A3-45FC-9A16-7EDBE04C9F79');
  
            -- CHECK constraint for MJ: AI Vendor Types: Field: Status was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Status]=N''Preview'' OR [Status]=N''Deprecated'' OR [Status]=N''Inactive'' OR [Status]=N''Active'')', 'public ValidateStatusInAllowedList(result: ValidationResult) {
	const allowedStatuses = ["Preview", "Deprecated", "Inactive", "Active"];
	if (!allowedStatuses.includes(this.Status)) {
		result.Errors.push(new ValidationErrorInfo(
			"Status",
			"Status must be one of the following: ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''.",
			this.Status,
			ValidationErrorType.Failure
		));
	}
}', 'This rule ensures that the status of the record can only be set to one of the following values: ''Preview'', ''Deprecated'', ''Inactive'', or ''Active''.', 'ValidateStatusInAllowedList', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F928E66C-7FA4-46B7-A08C-DB1784B52F58');
  
            

