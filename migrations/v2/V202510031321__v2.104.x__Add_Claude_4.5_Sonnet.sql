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
  @Priority_f6838ac1 = 3
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
  @Priority_364f143d = 1
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