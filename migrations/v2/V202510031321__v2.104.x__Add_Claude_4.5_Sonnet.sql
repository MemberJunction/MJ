-- Add Claude 4.5 Sonnet model
-- This migration adds:
-- 1. Claude 4.5 Sonnet as a new AI Model
-- 2. AIModelVendor associations for Anthropic as the model developer
-- 3. AIModelVendor associations for Anthropic as the inference provider
-- 4. Cost tracking record for Anthropic pricing

-- Use existing Anthropic Vendor ID
DECLARE @AnthropicVendorID UNIQUEIDENTIFIER = 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Anthropic Vendor ID (existing)

-- Model ID for the new model
DECLARE @Claude45SonnetModelID UNIQUEIDENTIFIER = '7d7c3623-34bc-4de5-b940-ec09367cfb3e';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Claude 4.5 Sonnet model record
INSERT INTO ${flyway:defaultSchema}.AIModel
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Claude45SonnetModelID,
        'Claude 4.5 Sonnet',
        'Anthropic''s most capable coding model with advanced reasoning and analysis capabilities. Features a 200K token context window with extended thinking support, state-of-the-art performance on coding benchmarks, and excellent instruction following.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        11, -- PowerRank (advanced reasoning capabilities)
        9, -- SpeedRank (fast response times)
        6  -- CostRank ($3/M input, $15/M output - mid-tier pricing)
    );

-- 2. Create AI Model Vendor association for Anthropic as model developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'bf8f1bf9-7424-46d0-b069-d923449e3ae0',
        @Claude45SonnetModelID,
        @AnthropicVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 3. Create AI Model Vendor association for Anthropic as inference provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '1d5e5faf-7bb8-4b3f-b11e-f972d6d39c64',
        @Claude45SonnetModelID,
        @AnthropicVendorID,
        @InferenceProviderTypeID,
        'claude-sonnet-4-5-20250929', -- Anthropic API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'AnthropicLLM', -- Driver class following Anthropic provider pattern
        NULL, -- DriverImportPath (not needed for AnthropicLLM)
        200000, -- MaxInputTokens (200K tokens context window)
        8192  -- MaxOutputTokens (8K based on documentation)
    );

-- 4. Add cost tracking record for Anthropic pricing (standard tier)
-- Note: Pricing includes prompt caching and batch processing discounts
INSERT INTO ${flyway:defaultSchema}.AIModelCost
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'f375172b-5bc4-4b63-b7da-b3b6d5310f1a',
        @Claude45SonnetModelID,
        @AnthropicVendorID,
        '2025-09-29', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        3.00, -- $3.00 per M input tokens (standard tier, up to 200K tokens)
        15.00, -- $15.00 per M output tokens (standard tier)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Claude 4.5 Sonnet standard tier pricing on Anthropic as of September 2025. Prompt caching available: write $3.75/M, read $0.30/M. Batch processing: 50% discount. Extended context (>200K tokens): $6/M input, $22.50/M output.'
    );


-- Update "SQL Parameter Extraction Prompt"'s AI Prompt Models

-- Save MJ: AI Prompt Models (core SP call only)
DECLARE @ID_f6838ac1 UNIQUEIDENTIFIER,
@PromptID_f6838ac1 UNIQUEIDENTIFIER,
@ModelID_f6838ac1 UNIQUEIDENTIFIER,
@VendorID_f6838ac1 UNIQUEIDENTIFIER,
@ConfigurationID_f6838ac1 UNIQUEIDENTIFIER,
@Priority_f6838ac1 INT,
@ExecutionGroup_f6838ac1 INT,
@ModelParameters_f6838ac1 NVARCHAR(MAX),
@Status_f6838ac1 NVARCHAR(20),
@ParallelizationMode_f6838ac1 NVARCHAR(20),
@ParallelCount_f6838ac1 INT,
@ParallelConfigParam_f6838ac1 NVARCHAR(100)
SET
  @ID_f6838ac1 = '987933bc-9cb1-4a1f-8fcc-06950463c100'
SET
  @PromptID_f6838ac1 = '8BF32885-8504-4DAF-87AE-695E09F1BC3A'
SET
  @ModelID_f6838ac1 = '0221217D-2037-48F8-AED0-286F53A165DF'
SET
  @VendorID_f6838ac1 = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @Priority_f6838ac1 = 1
SET
  @ExecutionGroup_f6838ac1 = 0
SET
  @Status_f6838ac1 = N'Active'
SET
  @ParallelizationMode_f6838ac1 = N'None'
SET
  @ParallelCount_f6838ac1 = 1
EXEC [${flyway:defaultSchema}].spCreateAIPromptModel @ID = @ID_f6838ac1,
  @PromptID = @PromptID_f6838ac1,
  @ModelID = @ModelID_f6838ac1,
  @VendorID = @VendorID_f6838ac1,
  @ConfigurationID = @ConfigurationID_f6838ac1,
  @Priority = @Priority_f6838ac1,
  @ExecutionGroup = @ExecutionGroup_f6838ac1,
  @ModelParameters = @ModelParameters_f6838ac1,
  @Status = @Status_f6838ac1,
  @ParallelizationMode = @ParallelizationMode_f6838ac1,
  @ParallelCount = @ParallelCount_f6838ac1,
  @ParallelConfigParam = @ParallelConfigParam_f6838ac1;

-- Save MJ: AI Prompt Models (core SP call only)
DECLARE @PromptID_364f143d UNIQUEIDENTIFIER,
@ModelID_364f143d UNIQUEIDENTIFIER,
@VendorID_364f143d UNIQUEIDENTIFIER,
@ConfigurationID_364f143d UNIQUEIDENTIFIER,
@Priority_364f143d INT,
@ExecutionGroup_364f143d INT,
@ModelParameters_364f143d NVARCHAR(MAX),
@Status_364f143d NVARCHAR(20),
@ParallelizationMode_364f143d NVARCHAR(20),
@ParallelCount_364f143d INT,
@ParallelConfigParam_364f143d NVARCHAR(100),
@ID_364f143d UNIQUEIDENTIFIER
SET
  @PromptID_364f143d = '8BF32885-8504-4DAF-87AE-695E09F1BC3A'
SET
  @ModelID_364f143d = '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0'
SET
  @VendorID_364f143d = '3EDA433E-F36B-1410-8DB6-00021F8B792E'
SET
  @Priority_364f143d = 3
SET
  @ExecutionGroup_364f143d = 0
SET
  @Status_364f143d = N'Active'
SET
  @ParallelizationMode_364f143d = N'None'
SET
  @ParallelCount_364f143d = 1
SET
  @ID_364f143d = 'DA560AA4-35DA-4EDA-81AC-A74D196E102F'
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = @PromptID_364f143d,
  @ModelID = @ModelID_364f143d,
  @VendorID = @VendorID_364f143d,
  @ConfigurationID = @ConfigurationID_364f143d,
  @Priority = @Priority_364f143d,
  @ExecutionGroup = @ExecutionGroup_364f143d,
  @ModelParameters = @ModelParameters_364f143d,
  @Status = @Status_364f143d,
  @ParallelizationMode = @ParallelizationMode_364f143d,
  @ParallelCount = @ParallelCount_364f143d,
  @ParallelConfigParam = @ParallelConfigParam_364f143d,
  @ID = @ID_364f143d;

-- Save MJ: AI Prompt Models (core SP call only)
DECLARE @PromptID_b6fac49b UNIQUEIDENTIFIER,
@ModelID_b6fac49b UNIQUEIDENTIFIER,
@VendorID_b6fac49b UNIQUEIDENTIFIER,
@ConfigurationID_b6fac49b UNIQUEIDENTIFIER,
@Priority_b6fac49b INT,
@ExecutionGroup_b6fac49b INT,
@ModelParameters_b6fac49b NVARCHAR(MAX),
@Status_b6fac49b NVARCHAR(20),
@ParallelizationMode_b6fac49b NVARCHAR(20),
@ParallelCount_b6fac49b INT,
@ParallelConfigParam_b6fac49b NVARCHAR(100),
@ID_b6fac49b UNIQUEIDENTIFIER
SET
  @PromptID_b6fac49b = '8BF32885-8504-4DAF-87AE-695E09F1BC3A'
SET
  @ModelID_b6fac49b = '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0'
SET
  @VendorID_b6fac49b = 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @Priority_b6fac49b = 2
SET
  @ExecutionGroup_b6fac49b = 0
SET
  @Status_b6fac49b = N'Active'
SET
  @ParallelizationMode_b6fac49b = N'None'
SET
  @ParallelCount_b6fac49b = 1
SET
  @ID_b6fac49b = '042CAE39-2AEB-4957-A5B3-7182B4D1D9C4'
EXEC [${flyway:defaultSchema}].spUpdateAIPromptModel @PromptID = @PromptID_b6fac49b,
  @ModelID = @ModelID_b6fac49b,
  @VendorID = @VendorID_b6fac49b,
  @ConfigurationID = @ConfigurationID_b6fac49b,
  @Priority = @Priority_b6fac49b,
  @ExecutionGroup = @ExecutionGroup_b6fac49b,
  @ModelParameters = @ModelParameters_b6fac49b,
  @Status = @Status_b6fac49b,
  @ParallelizationMode = @ParallelizationMode_b6fac49b,
  @ParallelCount = @ParallelCount_b6fac49b,
  @ParallelConfigParam = @ParallelConfigParam_b6fac49b,
  @ID = @ID_b6fac49b;


  -- Save Actions (core SP call only)
DECLARE @CategoryID_e391d130 UNIQUEIDENTIFIER,
@Name_e391d130 NVARCHAR(425),
@Description_e391d130 NVARCHAR(MAX),
@Type_e391d130 NVARCHAR(20),
@UserPrompt_e391d130 NVARCHAR(MAX),
@UserComments_e391d130 NVARCHAR(MAX),
@Code_e391d130 NVARCHAR(MAX),
@CodeComments_e391d130 NVARCHAR(MAX),
@CodeApprovalStatus_e391d130 NVARCHAR(20),
@CodeApprovalComments_e391d130 NVARCHAR(MAX),
@CodeApprovedByUserID_e391d130 UNIQUEIDENTIFIER,
@CodeApprovedAt_e391d130 DATETIME,
@CodeLocked_e391d130 BIT,
@ForceCodeGeneration_e391d130 BIT,
@RetentionPeriod_e391d130 INT,
@Status_e391d130 NVARCHAR(20),
@DriverClass_e391d130 NVARCHAR(255),
@ParentID_e391d130 UNIQUEIDENTIFIER,
@IconClass_e391d130 NVARCHAR(100),
@ID_e391d130 UNIQUEIDENTIFIER
SET
  @CategoryID_e391d130 = '095EC184-0AAB-4122-A9B9-B64F0215F7DA'
SET
  @Name_e391d130 = N'Web Page Content'
SET
  @Description_e391d130 = N'Retrieves and processes web content in various formats including JSON APIs, PDF documents, DOCX files, XML, CSV, HTML and more - with intelligent content type detection and format conversion'
SET
  @Type_e391d130 = N'Custom'
SET
  @CodeApprovalStatus_e391d130 = N'Pending'
SET
  @CodeLocked_e391d130 = 0
SET
  @ForceCodeGeneration_e391d130 = 0
SET
  @Status_e391d130 = N'Active'
SET
  @DriverClass_e391d130 = N'__WebPageContent'
SET
  @IconClass_e391d130 = N'fa-solid fa-globe'
SET
  @ID_e391d130 = '81F96534-03F5-49E9-81B0-D8902A7645A3'
EXEC [${flyway:defaultSchema}].spUpdateAction @CategoryID = @CategoryID_e391d130,
  @Name = @Name_e391d130,
  @Description = @Description_e391d130,
  @Type = @Type_e391d130,
  @UserPrompt = @UserPrompt_e391d130,
  @UserComments = @UserComments_e391d130,
  @Code = @Code_e391d130,
  @CodeComments = @CodeComments_e391d130,
  @CodeApprovalStatus = @CodeApprovalStatus_e391d130,
  @CodeApprovalComments = @CodeApprovalComments_e391d130,
  @CodeApprovedByUserID = @CodeApprovedByUserID_e391d130,
  @CodeApprovedAt = @CodeApprovedAt_e391d130,
  @CodeLocked = @CodeLocked_e391d130,
  @ForceCodeGeneration = @ForceCodeGeneration_e391d130,
  @RetentionPeriod = @RetentionPeriod_e391d130,
  @Status = @Status_e391d130,
  @DriverClass = @DriverClass_e391d130,
  @ParentID = @ParentID_e391d130,
  @IconClass = @IconClass_e391d130,
  @ID = @ID_e391d130;

-- Save Action Params (core SP call only)
DECLARE @ActionID_38cf0427 UNIQUEIDENTIFIER,
@Name_38cf0427 NVARCHAR(255),
@DefaultValue_38cf0427 NVARCHAR(MAX),
@Type_38cf0427 NCHAR(10),
@ValueType_38cf0427 NVARCHAR(30),
@IsArray_38cf0427 BIT,
@Description_38cf0427 NVARCHAR(MAX),
@IsRequired_38cf0427 BIT,
@ID_38cf0427 UNIQUEIDENTIFIER
SET
  @ActionID_38cf0427 = '81F96534-03F5-49E9-81B0-D8902A7645A3'
SET
  @Name_38cf0427 = N'ContentType'
SET
  @DefaultValue_38cf0427 = N'auto'
SET
  @Type_38cf0427 = N'Input'
SET
  @ValueType_38cf0427 = N'Scalar'
SET
  @IsArray_38cf0427 = 0
SET
  @Description_38cf0427 = N'Output format - ''auto'' (intelligent detection), ''text'', ''html'', ''markdown'', ''json''. Auto-detects and processes JSON, PDF, DOCX, XML, CSV, HTML, images and more (default: ''auto'')'
SET
  @IsRequired_38cf0427 = 0
SET
  @ID_38cf0427 = 'E013D3BF-E9B1-4B65-BB46-B2F293651FB0'
EXEC [${flyway:defaultSchema}].spUpdateActionParam @ActionID = @ActionID_38cf0427,
  @Name = @Name_38cf0427,
  @DefaultValue = @DefaultValue_38cf0427,
  @Type = @Type_38cf0427,
  @ValueType = @ValueType_38cf0427,
  @IsArray = @IsArray_38cf0427,
  @Description = @Description_38cf0427,
  @IsRequired = @IsRequired_38cf0427,
  @ID = @ID_38cf0427;

-- Save Action Params (core SP call only)
DECLARE @ActionID_da2be0c5 UNIQUEIDENTIFIER,
@Name_da2be0c5 NVARCHAR(255),
@DefaultValue_da2be0c5 NVARCHAR(MAX),
@Type_da2be0c5 NCHAR(10),
@ValueType_da2be0c5 NVARCHAR(30),
@IsArray_da2be0c5 BIT,
@Description_da2be0c5 NVARCHAR(MAX),
@IsRequired_da2be0c5 BIT,
@ID_da2be0c5 UNIQUEIDENTIFIER
SET
  @ActionID_da2be0c5 = '81F96534-03F5-49E9-81B0-D8902A7645A3'
SET
  @Name_da2be0c5 = N'MaxContentLength'
SET
  @DefaultValue_da2be0c5 = N'100000'
SET
  @Type_da2be0c5 = N'Input'
SET
  @ValueType_da2be0c5 = N'Scalar'
SET
  @IsArray_da2be0c5 = 0
SET
  @Description_da2be0c5 = N'Maximum content length to return (default: 100000 chars)'
SET
  @IsRequired_da2be0c5 = 0
SET
  @ID_da2be0c5 = '2749E985-DC09-4DD3-902B-BDB7C7E6B036'
EXEC [${flyway:defaultSchema}].spUpdateActionParam @ActionID = @ActionID_da2be0c5,
  @Name = @Name_da2be0c5,
  @DefaultValue = @DefaultValue_da2be0c5,
  @Type = @Type_da2be0c5,
  @ValueType = @ValueType_da2be0c5,
  @IsArray = @IsArray_da2be0c5,
  @Description = @Description_da2be0c5,
  @IsRequired = @IsRequired_da2be0c5,
  @ID = @ID_da2be0c5;

-- Save Action Result Codes (core SP call only)
DECLARE @ActionID_c26b891a UNIQUEIDENTIFIER,
@ResultCode_c26b891a NVARCHAR(255),
@IsSuccess_c26b891a BIT,
@Description_c26b891a NVARCHAR(MAX),
@ID_c26b891a UNIQUEIDENTIFIER
SET
  @ActionID_c26b891a = '81F96534-03F5-49E9-81B0-D8902A7645A3'
SET
  @ResultCode_c26b891a = N'INVALID_CONTENT_TYPE'
SET
  @IsSuccess_c26b891a = 0
SET
  @Description_c26b891a = N'ContentType must be one of: auto, text, html, markdown, json'
SET
  @ID_c26b891a = '8FE1314F-9649-4AD5-922B-30D110E1F6E4'
EXEC [${flyway:defaultSchema}].spUpdateActionResultCode @ActionID = @ActionID_c26b891a,
  @ResultCode = @ResultCode_c26b891a,
  @IsSuccess = @IsSuccess_c26b891a,
  @Description = @Description_c26b891a,
  @ID = @ID_c26b891a;

-- Save Action Result Codes (core SP call only)
DECLARE @ActionID_c203ffd4 UNIQUEIDENTIFIER,
@ResultCode_c203ffd4 NVARCHAR(255),
@IsSuccess_c203ffd4 BIT,
@Description_c203ffd4 NVARCHAR(MAX),
@ID_c203ffd4 UNIQUEIDENTIFIER
SET
  @ActionID_c203ffd4 = '81F96534-03F5-49E9-81B0-D8902A7645A3'
SET
  @ResultCode_c203ffd4 = N'UNSUPPORTED_CONTENT_TYPE'
SET
  @IsSuccess_c203ffd4 = 0
SET
  @Description_c203ffd4 = N'Rare edge case: content type could not be processed (supports JSON, PDF, DOCX, XML, CSV, HTML, images, text)'
SET
  @ID_c203ffd4 = '93FEBC8D-3375-4A7E-B0BA-92A03B4152AD'
EXEC [${flyway:defaultSchema}].spUpdateActionResultCode @ActionID = @ActionID_c203ffd4,
  @ResultCode = @ResultCode_c203ffd4,
  @IsSuccess = @IsSuccess_c203ffd4,
  @Description = @Description_c203ffd4,
  @ID = @ID_c203ffd4;