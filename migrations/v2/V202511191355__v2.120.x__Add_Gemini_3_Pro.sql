-- Add Gemini 3 Pro (Preview) model
-- This migration adds:
-- 1. Gemini 3 Pro as a new AI Model
-- 2. AIModelVendor associations for Google as the model developer
-- 3. AIModelVendor associations for Google as the inference provider
-- 4. Cost tracking record for Google pricing

-- Use existing Google Vendor ID
DECLARE @VendorID UNIQUEIDENTIFIER = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Google Vendor ID (existing)

-- Model ID for the new model
DECLARE @ModelID UNIQUEIDENTIFIER = 'B7267218-302B-4C09-9875-8DF06AAA1695';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Gemini 3 Pro model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @ModelID,
        'Gemini 3 Pro',
        'Google''s most powerful agentic and multimodal model with state-of-the-art reasoning. Features industry-leading 1M token input context window and 64k output capacity. Achieves top scores across 19 of 20 major AI benchmarks (1501 Elo on LMArena). Exceptional multimodal understanding, coding, and agentic capabilities with knowledge cutoff of January 2025.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        12, -- PowerRank (highest - benchmark leader across reasoning, coding, multimodal)
        8, -- SpeedRank (fast - benchmarks show competitive speed vs GPT-5.1 and Claude)
        10  -- CostRank (premium pricing tier)
    );

-- 2. Create AI Model Vendor association for Google as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '86B45CA4-688A-465C-8C48-D6B0F9DFFEBE',
        @ModelID,
        @VendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        1, -- SupportsEffortLevel (advanced reasoning capabilities)
        0  -- SupportsStreaming (0 for developer role)
    );

-- 3. Create AI Model Vendor association for Google as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'F261666C-7272-476A-847B-E2BF01316E22',
        @ModelID,
        @VendorID,
        @InferenceProviderTypeID,
        'gemini-3-pro-preview', -- API name (preview version, will be updated when GA releases)
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel (advanced reasoning and agentic capabilities)
        1, -- SupportsStreaming
        'GoogleLLM', -- Driver class
        NULL, -- DriverImportPath (usually NULL)
        1000000, -- MaxInputTokens (1M token input context window)
        65536  -- MaxOutputTokens (64k output capacity)
    );

-- 4. Add cost tracking record for Google pricing
-- Note: Gemini 3 Pro has tiered pricing based on prompt size
-- Using the base tier pricing (prompts <= 200k tokens)
-- Input: $2.00 per 1M tokens, Output: $12.00 per 1M tokens
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '694B9C05-604C-42C0-849F-464EC66C900D',
        @ModelID,
        @VendorID,
        '2025-11-18', -- Preview released November 18, 2025
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        2.00, -- Input price per M tokens (base tier <= 200k)
        12.00, -- Output price per M tokens (base tier <= 200k)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Gemini 3 Pro (Preview) pricing on Google as of November 2025. Base tier pricing shown ($2/$12 per 1M tokens for prompts <= 200k). Higher tier available for prompts > 200k ($4/$18 per 1M tokens). Released Nov 18, 2025 with fastest-ever deployment into Google Search. API name is gemini-3-pro-preview and will be updated to gemini-3-pro when GA releases. Features 1M token input context window, 64k output capacity, and knowledge cutoff of January 2025. Achieves state-of-the-art performance across 19 of 20 major AI benchmarks including top scores in reasoning (Humanity''s Last Exam: 37.5%), coding (SWE-Bench: 76.2%), and multimodal understanding (MMLU: 91.8%).'
    );
