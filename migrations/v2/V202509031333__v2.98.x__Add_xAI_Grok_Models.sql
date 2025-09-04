-- Add x.ai Vendor and Grok models (Grok Code Fast 1, Grok 4) with model developer and inference provider associations
-- This migration adds:
-- 1. x.ai as a new AI Vendor
-- 2. Grok Code Fast 1 as a new AI Model
-- 3. Grok 4 (0709) as a new AI Model
-- 4. AIModelVendor associations for x.ai as the model developer for both models
-- 5. AIModelVendor associations for x.ai as the inference provider for both models
-- 6. Cost tracking records for x.ai pricing

-- Variable placeholders for IDs
DECLARE @xAIVendorID UNIQUEIDENTIFIER = '5483D98F-1F4E-40F4-91FC-EAA8EFDC90F1'; -- x.ai Vendor ID

-- Model IDs for the new models
DECLARE @GrokCodeFast1ModelID UNIQUEIDENTIFIER = 'AF6B48C8-8E99-4472-BDDF-570BF59F7B22';
DECLARE @Grok4ModelID UNIQUEIDENTIFIER = '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create x.ai vendor record
INSERT INTO ${flyway:defaultSchema}.AIVendor 
    (ID, Name, Description)
VALUES 
    (
        @xAIVendorID,
        'x.ai',
        'x.ai is the creator of the Grok series of large language models that power various AI applications including coding assistance and general reasoning.'
    );

-- 2. Create Grok Code Fast 1 model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GrokCodeFast1ModelID,
        'Grok Code Fast 1',
        'x.ai''s specialized coding model optimized for software development tasks. Features a 256K token context window with excellent code generation and understanding capabilities.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        10, -- PowerRank (strong coding model)
        9, -- SpeedRank (optimized for fast responses)
        3  -- CostRank (very cost-effective at $0.20/M input)
    );

-- 3. Create Grok 4 model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Grok4ModelID,
        'Grok 4',
        'x.ai''s frontier reasoning model with advanced capabilities for complex tasks. Features a 256K token context window and state-of-the-art performance across various domains.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        14, -- PowerRank (frontier model, very powerful)
        6, -- SpeedRank (larger model, moderate speed)
        8  -- CostRank (premium pricing at $3/M input)
    );

-- 4. Create AI Model Vendor associations for x.ai as model developer (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '8D4D36C3-3FA6-493E-B017-9BA9C8178EE5',
        @GrokCodeFast1ModelID,
        @xAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    (
        'A1848DF9-1DEF-43C1-9C5D-BEDA6AFBCAD7',
        @Grok4ModelID,
        @xAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 5. Create AI Model Vendor associations for x.ai as inference provider (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '73C58B9B-1470-470C-B2F1-F58662C9B583',
        @GrokCodeFast1ModelID,
        @xAIVendorID,
        @InferenceProviderTypeID,
        'grok-code-fast-1', -- x.ai API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'XAIService', -- Driver class following xAI provider pattern
        256000, -- MaxInputTokens (256k tokens)
        8192  -- MaxOutputTokens (standard output limit)
    ),
    (
        '386BAA17-71D0-42D3-8B36-ABD9279AF319',
        @Grok4ModelID,
        @xAIVendorID,
        @InferenceProviderTypeID,
        'grok-4-0709', -- x.ai API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'XAIService', -- Driver class following xAI provider pattern
        256000, -- MaxInputTokens (256k tokens)
        8192  -- MaxOutputTokens (standard output limit)
    );

-- 6. Add cost tracking records for x.ai pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        '166A7DAA-3BDE-40CF-9363-A63FBE9798F2',
        @GrokCodeFast1ModelID,
        @xAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.20, -- $0.20 per M input tokens
        1.50, -- $1.50 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Grok Code Fast 1 pricing on x.ai as of January 2025'
    ),
    (
        '2EA2BFFC-3EFB-4D23-9985-055C2FF18620',
        @Grok4ModelID,
        @xAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        3.00, -- $3.00 per M input tokens
        15.00, -- $15.00 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Grok 4 pricing on x.ai as of January 2025'
    );

-- Log the operation
PRINT 'Successfully added x.ai vendor and Grok models:';
PRINT 'x.ai Vendor ID: ' + CAST(@xAIVendorID AS NVARCHAR(50));
PRINT '';
PRINT 'Model IDs:';
PRINT 'Grok Code Fast 1 Model ID: ' + CAST(@GrokCodeFast1ModelID AS NVARCHAR(50));
PRINT 'Grok 4 Model ID: ' + CAST(@Grok4ModelID AS NVARCHAR(50));
PRINT '';
PRINT 'Model Developer Associations:';
PRINT 'x.ai Developer (Grok Code Fast 1): 8D4D36C3-3FA6-493E-B017-9BA9C8178EE5';
PRINT 'x.ai Developer (Grok 4): A1848DF9-1DEF-43C1-9C5D-BEDA6AFBCAD7';
PRINT '';
PRINT 'Inference Provider Associations:';
PRINT 'x.ai Inference (Grok Code Fast 1): 73C58B9B-1470-470C-B2F1-F58662C9B583';
PRINT 'x.ai Inference (Grok 4): 386BAA17-71D0-42D3-8B36-ABD9279AF319';
PRINT '';
PRINT 'Cost Tracking Records:';
PRINT 'x.ai Cost (Grok Code Fast 1): 166A7DAA-3BDE-40CF-9363-A63FBE9798F2';
PRINT 'x.ai Cost (Grok 4): 2EA2BFFC-3EFB-4D23-9985-055C2FF18620';