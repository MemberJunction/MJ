-- Add Claude 4.5 Opus model
-- This migration adds:
-- 1. Claude 4.5 Opus as a new AI Model
-- 2. AIModelVendor associations for Anthropic as the model developer
-- 3. AIModelVendor associations for Anthropic as the inference provider
-- 4. Cost tracking record for Anthropic pricing

-- Use existing Anthropic Vendor ID
DECLARE @VendorID UNIQUEIDENTIFIER = 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Anthropic Vendor ID (existing)

-- Model ID for the new model
DECLARE @ModelID UNIQUEIDENTIFIER = '52B79053-6E59-44E9-B7D0-DA96C4EA3CF1';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Claude 4.5 Opus model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @ModelID,
        'Claude 4.5 Opus',
        'Anthropic''s largest, intelligent, efficient, and the best model in the world for coding, agents, and computer use.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        13, -- PowerRank (highest - benchmark leader across reasoning, coding, multimodal)
        8, -- SpeedRank (fast - benchmarks show competitive speed vs GPT-5.1 and Claude)
        10  -- CostRank (premium pricing tier)
    );

-- 2. Create AI Model Vendor association for Google as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '3E20E446-4E9D-4524-9840-3EEB503361E3',
        @ModelID,
        @VendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        1, -- SupportsEffortLevel (advanced reasoning capabilities)
        0  -- SupportsStreaming (0 for developer role)
    );

-- 3. Create AI Model Vendor association for Anthropic as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '7D2769CD-4EDA-4857-93CB-A5D6FCC55708',
        @ModelID,
        @VendorID,
        @InferenceProviderTypeID,
        'claude-opus-4-5-20251101', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel (advanced reasoning and agentic capabilities)
        1, -- SupportsStreaming
        'AnthropicLLM', -- Driver class
        NULL, -- DriverImportPath (usually NULL)
        200000, -- MaxInputTokens (1M token input context window)
        64000  -- MaxOutputTokens (64k output capacity)
    );

-- 4. Add cost tracking record for Anthropic pricing
-- Input: $5.00 per 1M tokens, Output: $25.00 per 1M tokens
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '6A987D9F-584B-48A0-B5C2-0231AF7EF063',
        @ModelID,
        @VendorID,
        '2025-11-24', -- Preview released November 24, 2025
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        5.00, -- Input price per M tokens (base tier <= 200k)
        25.00, -- Output price per M tokens (base tier <= 200k)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Claude 4.5 Opus pricing on Anthropic as of November 2025.  Released Nov 24, 2025. API name is gemini-3-pro-preview and will be updated to gemini-3-pro when GA releases. Features 1M token input context window, 64k output capacity, and knowledge cutoff of January 2025. Achieves state-of-the-art performance across 19 of 20 major AI benchmarks including top scores in reasoning (Humanity''s Last Exam: 37.5%), coding (SWE-Bench: 76.2%), and multimodal understanding (MMLU: 91.8%).'
    );
