-- Add OpenRouter as inference provider and Codestral 2508 model with multi-vendor support
-- This migration adds:
-- 1. OpenRouter as a new AI Vendor (Inference Provider)
-- 2. OpenRouter vendor type association for inference provider
-- 3. Mistral Codestral 2508 as a new AI Model
-- 4. AIModelVendor association for Mistral as model developer for Codestral
-- 5. AIModelVendor associations for Mistral and OpenRouter as inference providers for Codestral
-- 6. AIModelVendor association for OpenRouter as inference provider for Qwen 3 Coder 480B
-- 7. Cost tracking records for all new vendor-model combinations

-- Variable placeholders for vendor IDs
DECLARE @OpenRouterVendorID UNIQUEIDENTIFIER = '5AD8786B-2D00-45D5-AFBE-DAEC48963FFC'; -- OpenRouter Vendor ID (new)
DECLARE @MistralVendorID UNIQUEIDENTIFIER = 'DBA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Mistral Vendor ID (existing)

-- Model IDs
DECLARE @CodestralModelID UNIQUEIDENTIFIER = 'EEBC4377-20B3-4114-8665-CEFD2C1AA6B5'; -- Codestral 2508 (new)
DECLARE @QwenCoder480BModelID UNIQUEIDENTIFIER = '711EDB52-2013-46E9-9A1F-59F439BC9E22'; -- Qwen 3 Coder 480B (existing)

-- Type IDs
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- LLM model type
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257'; -- Model Developer type
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3'; -- Inference Provider type

-- 1. Create OpenRouter vendor record
INSERT INTO ${flyway:defaultSchema}.AIVendor 
    (ID, Name, Description)
VALUES 
    (
        @OpenRouterVendorID,
        'OpenRouter',
        'Unified API gateway providing access to hundreds of AI models from various providers with automatic routing and failover capabilities across many inference providers'
    );

-- 2. Create OpenRouter vendor type for inference provider
INSERT INTO ${flyway:defaultSchema}.AIVendorType 
    (ID, VendorID, TypeID, Rank, Status)
VALUES 
    (
        'D43D4D95-11E2-474E-90BF-2A96ED5427B8',
        @OpenRouterVendorID,
        @InferenceProviderTypeID,
        8, -- Rank (lower than direct providers but still good)
        'Active'
    );

-- 3. Create Mistral Codestral 2508 model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @CodestralModelID,
        'Codestral 2508',
        'Mistral''s code generation model released July 2025. State-of-the-art performance for code completion, generation, and analysis across 80+ programming languages with enhanced understanding of complex codebases.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        14, -- PowerRank (very powerful for coding)
        8, -- SpeedRank (fast for a code model)
        8  -- CostRank (low cost - $0.3/$0.9 per M tokens)
    );

-- 4. Create AI Model Vendor association for Mistral as model developer for Codestral
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '457BE82D-11D4-431C-944C-0ED589BF9EF6',
        @CodestralModelID,
        @MistralVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (not used for model developers)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 5. Create AI Model Vendor association for Mistral as inference provider for Codestral
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        'B27050EF-659C-4AEC-AEEA-60BF84B6763A',
        @CodestralModelID,
        @MistralVendorID,
        @InferenceProviderTypeID,
        'codestral-latest', -- Mistral API name
        100, -- Priority (highest - prefer direct provider)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'MistralLLM',
        256000, -- MaxInputTokens (256k context window)
        256000  -- MaxOutputTokens (256k output limit)
    );

-- 6. Create AI Model Vendor association for OpenRouter as inference provider for Codestral
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '227EDD73-6FF3-49A2-A132-2945688F326F',
        @CodestralModelID,
        @OpenRouterVendorID,
        @InferenceProviderTypeID,
        'mistralai/codestral-2508', -- OpenRouter API name
        50, -- Priority (lower than direct Mistral)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenRouterLLM',
        256000, -- MaxInputTokens (256k context window)
        256000  -- MaxOutputTokens (256k output limit)
    );

-- 7. Create AI Model Vendor association for OpenRouter as inference provider for Qwen 3 Coder 480B
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '48BC7CDF-7771-4584-8B33-26E690FB92C0',
        @QwenCoder480BModelID,
        @OpenRouterVendorID,
        @InferenceProviderTypeID,
        'qwen/qwen3-coder', -- OpenRouter API name for Qwen 3 Coder
        40, -- Priority (lower than Cerebras which has priority 0)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenRouterLLM',
        128000, -- MaxInputTokens (128k context window)
        16384   -- MaxOutputTokens (16k output limit)
    );

-- 8. Add cost tracking record for Mistral Codestral pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        '6BC32706-CA3A-4F04-9B85-FC28AA9ADED0',
        @CodestralModelID,
        @MistralVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.30, -- $0.30 per M input tokens
        0.90, -- $0.90 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Codestral 2508 pricing on Mistral as of August 2025'
    );

-- 9. Add cost tracking record for OpenRouter Qwen 3 Coder 480B pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        '36E2223B-4D16-46CB-BF74-DFF7679DCF59',
        @QwenCoder480BModelID,
        @OpenRouterVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.38, -- $0.38 per M input tokens (average pricing)
        1.53, -- $1.53 per M output tokens (average pricing)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Qwen 3 Coder 480B average pricing on OpenRouter as of August 2025'
    );

-- 10. Add cost tracking record for OpenRouter Codestral pricing (pass-through from Mistral)
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        'BA60D6EF-093A-4D25-8B25-8E45CF7B6310',
        @CodestralModelID,
        @OpenRouterVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.30, -- $0.30 per M input tokens (same as Mistral)
        0.90, -- $0.90 per M output tokens (same as Mistral)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Codestral 2508 pass-through pricing on OpenRouter as of August 2025'
    );

-- Log the operation
PRINT 'Successfully added OpenRouter vendor and Codestral 2508 model:';
PRINT 'OpenRouter Vendor ID: ' + CAST(@OpenRouterVendorID AS NVARCHAR(50));
PRINT 'Codestral 2508 Model ID: ' + CAST(@CodestralModelID AS NVARCHAR(50));
PRINT '';
PRINT 'Vendor Type Associations:';
PRINT 'OpenRouter Inference Provider Type: D43D4D95-11E2-474E-90BF-2A96ED5427B8';
PRINT '';
PRINT 'Model Developer Associations:';
PRINT 'Mistral Developer (Codestral): 457BE82D-11D4-431C-944C-0ED589BF9EF6';
PRINT '';
PRINT 'Inference Provider Associations:';
PRINT 'Mistral Inference (Codestral): B27050EF-659C-4AEC-AEEA-60BF84B6763A (Priority: 100)';
PRINT 'OpenRouter Inference (Codestral): 227EDD73-6FF3-49A2-A132-2945688F326F (Priority: 50)';
PRINT 'OpenRouter Inference (Qwen Coder): 48BC7CDF-7771-4584-8B33-26E690FB92C0 (Priority: 40)';
PRINT '';
PRINT 'Cost Tracking Records:';
PRINT 'Mistral Cost (Codestral): 6BC32706-CA3A-4F04-9B85-FC28AA9ADED0';
PRINT 'OpenRouter Cost (Qwen Coder): 36E2223B-4D16-46CB-BF74-DFF7679DCF59';
PRINT 'OpenRouter Cost (Codestral): BA60D6EF-093A-4D25-8B25-8E45CF7B6310';
PRINT '';
PRINT 'Priority Configuration:';
PRINT '- Mistral direct API has priority 100 for Codestral (highest, preferred)';
PRINT '- OpenRouter has priority 50 for Codestral (fallback option)';
PRINT '- OpenRouter has priority 40 for Qwen Coder (lower than Cerebras)';