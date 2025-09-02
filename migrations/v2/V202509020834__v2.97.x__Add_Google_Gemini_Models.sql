-- Add Google Gemini models (2.5 Pro, 2.5 Flash, 2.5 Flash-Lite) with model developer and inference provider associations
-- This migration adds:
-- 1. Gemini 2.5 Pro as a new AI Model
-- 2. Gemini 2.5 Flash as a new AI Model
-- 3. Gemini 2.5 Flash-Lite as a new AI Model
-- 4. AIModelVendor associations for Google as the model developer for all three models
-- 5. AIModelVendor associations for Google as the inference provider for all three models
-- 6. Cost tracking records for Google pricing

-- Variable placeholders for vendor IDs 
DECLARE @GoogleVendorID UNIQUEIDENTIFIER = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Google Vendor ID

-- Model IDs for the new models
DECLARE @Gemini25ProModelID UNIQUEIDENTIFIER = 'C478D8CD-9D81-491A-9992-139F45789309';
DECLARE @Gemini25FlashModelID UNIQUEIDENTIFIER = '072969C3-7D19-43FF-83E9-051E7A2D3586';
DECLARE @Gemini25FlashLiteModelID UNIQUEIDENTIFIER = '13297942-3AE2-4584-832C-551237847140';

-- Type IDs
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Gemini 2.5 Pro model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Gemini25ProModelID,
        'Gemini 2.5 Pro',
        'Google''s most powerful reasoning model, excelling at coding and complex reasoning tasks. Features a 200K token context window, 200K token input limit, and 10K token output limit.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        16, -- PowerRank (highest performing model)
        4, -- SpeedRank (moderate speed due to advanced reasoning)
        9  -- CostRank (premium pricing tier)
    );

-- 2. Create Gemini 2.5 Flash model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Gemini25FlashModelID,
        'Gemini 2.5 Flash',
        'Google''s hybrid reasoning model with a 1M token context window and thinking budgets. Balances performance and speed for production use cases. Supports 30K token input and 2.5K token output.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        12, -- PowerRank (strong but balanced performance)
        8, -- SpeedRank (fast with good reasoning capabilities)
        5  -- CostRank (moderate pricing)
    );

-- 3. Create Gemini 2.5 Flash-Lite model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Gemini25FlashLiteModelID,
        'Gemini 2.5 Flash-Lite',
        'Google''s smallest and most cost-effective model, built for scale usage. Optimized for speed with 10K token input limit and 400 token output limit.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        8, -- PowerRank (smaller model, less powerful)
        10, -- SpeedRank (fastest of the three)
        2  -- CostRank (most cost-effective)
    );

-- 4. Create AI Model Vendor associations for Google as model developer (all three models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        'E8F9B94E-44FA-4D41-B4DA-E267182BC009',
        @Gemini25ProModelID,
        @GoogleVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    (
        '81F75282-5AF4-4C17-8A6D-E9597FFC6F67',
        @Gemini25FlashModelID,
        @GoogleVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    (
        'EC589581-5058-4DEF-AFEC-278DA9DA034B',
        @Gemini25FlashLiteModelID,
        @GoogleVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 5. Create AI Model Vendor associations for Google as inference provider (all three models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '1E1A47BA-72B5-4DD0-A603-FF6F2108545C',
        @Gemini25ProModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'gemini-2.5-pro', -- Google API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'GeminiLLM',
        200000, -- MaxInputTokens (200k tokens)
        10000  -- MaxOutputTokens (10k tokens)
    ),
    (
        '13DF9C4B-0F88-49CA-8504-F2EDAE35D610',
        @Gemini25FlashModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'gemini-2.5-flash', -- Google API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'GeminiLLM',
        30000, -- MaxInputTokens (30k tokens)
        2500  -- MaxOutputTokens (2.5k tokens)
    ),
    (
        '3423CC74-137D-42E9-9F97-0BBC4B18AE9F',
        @Gemini25FlashLiteModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'gemini-2.5-flash-lite', -- Google API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'GeminiLLM',
        10000, -- MaxInputTokens (10k tokens)
        400  -- MaxOutputTokens (400 tokens)
    );

-- 6. Add cost tracking records for Google pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        'A50024D8-76BF-46B3-9209-8F53993F4550',
        @Gemini25ProModelID,
        @GoogleVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.25, -- $1.25 per M input tokens (< 200K tokens)
        10.00, -- $10.00 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Gemini 2.5 Pro pricing on Google as of January 2025'
    ),
    (
        '8548F400-4BE2-4D13-A67D-6C73ABE47D9E',
        @Gemini25FlashModelID,
        @GoogleVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.30, -- $0.30 per M input tokens (All context lengths)
        2.50, -- $2.50 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Gemini 2.5 Flash pricing on Google as of January 2025'
    ),
    (
        'CA9801E9-2A63-4F8A-9357-800A4ADE9330',
        @Gemini25FlashLiteModelID,
        @GoogleVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.10, -- $0.10 per M input tokens (All context lengths)
        0.40, -- $0.40 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Gemini 2.5 Flash-Lite pricing on Google as of January 2025'
    );

-- Log the operation
PRINT 'Successfully added Google Gemini models:';
PRINT 'Gemini 2.5 Pro Model ID: ' + CAST(@Gemini25ProModelID AS NVARCHAR(50));
PRINT 'Gemini 2.5 Flash Model ID: ' + CAST(@Gemini25FlashModelID AS NVARCHAR(50));
PRINT 'Gemini 2.5 Flash-Lite Model ID: ' + CAST(@Gemini25FlashLiteModelID AS NVARCHAR(50));
PRINT '';
PRINT 'Model Developer Associations:';
PRINT 'Google Developer (2.5 Pro): E8F9B94E-44FA-4D41-B4DA-E267182BC009';
PRINT 'Google Developer (2.5 Flash): 81F75282-5AF4-4C17-8A6D-E9597FFC6F67';
PRINT 'Google Developer (2.5 Flash-Lite): EC589581-5058-4DEF-AFEC-278DA9DA034B';
PRINT '';
PRINT 'Inference Provider Associations:';
PRINT 'Google Inference (2.5 Pro): 1E1A47BA-72B5-4DD0-A603-FF6F2108545C';
PRINT 'Google Inference (2.5 Flash): 13DF9C4B-0F88-49CA-8504-F2EDAE35D610';
PRINT 'Google Inference (2.5 Flash-Lite): 3423CC74-137D-42E9-9F97-0BBC4B18AE9F';
PRINT '';
PRINT 'Cost Tracking Records:';
PRINT 'Google Cost (2.5 Pro): A50024D8-76BF-46B3-9209-8F53993F4550';
PRINT 'Google Cost (2.5 Flash): 8548F400-4BE2-4D13-A67D-6C73ABE47D9E';
PRINT 'Google Cost (2.5 Flash-Lite): CA9801E9-2A63-4F8A-9357-800A4ADE9330';