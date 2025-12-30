-- Add Gemini 3 Flash and GPT-5.2 models
-- This migration adds:
-- 1. Gemini 3 Flash as a new AI Model
-- 2. AIModelVendor associations for Google as the model developer and inference provider
-- 3. Cost tracking record for Google pricing
-- 4. GPT-5.2 as a new AI Model
-- 5. AIModelVendor associations for OpenAI as the model developer and inference provider
-- 6. Cost tracking record for OpenAI pricing

-- ============================================
-- GEMINI 3 FLASH
-- ============================================

-- Use existing Google Vendor ID
DECLARE @GoogleVendorID UNIQUEIDENTIFIER = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E';

-- Model ID for Gemini 3 Flash
DECLARE @Gemini3FlashModelID UNIQUEIDENTIFIER = '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Gemini 3 Flash model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Gemini3FlashModelID,
        'Gemini 3 Flash',
        'Google''s advanced multimodal model with 1M token input context window and 64k output capacity. Achieves Intelligence Index score of 71 (13-point improvement from previous version) with 89% on MMLU-Pro, 90% on GPQA Diamond, and second highest score on MMMU-Pro for multimodal reasoning. Supports text, image, video, and audio input with tool calling, structured outputs, and JSON mode. Knowledge cutoff of January 2025.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        9, -- PowerRank (high capability - Intelligence Index 71, strong benchmark scores)
        10, -- SpeedRank (218 tokens/second output speed)
        3  -- CostRank (affordable - $0.50 input, $3 output per 1M tokens)
    );

-- 2. Create AI Model Vendor association for Google as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '5B832E03-B2EB-4196-80A0-D90794400F04',
        @Gemini3FlashModelID,
        @GoogleVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 3. Create AI Model Vendor association for Google as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '3E5C69EA-B6CE-4526-ADD5-A0FD95B5188A',
        @Gemini3FlashModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'gemini-3-flash-preview', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel (has reasoning variant available)
        1, -- SupportsStreaming
        'GeminiLLM', -- Driver class
        NULL, -- DriverImportPath (usually NULL)
        1000000, -- MaxInputTokens (1M token context window)
        64000  -- MaxOutputTokens (64k output capacity)
    );

-- 4. Add cost tracking record for Google pricing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'A810DD29-F83D-4076-9543-29581922B4A0',
        @Gemini3FlashModelID,
        @GoogleVendorID,
        '2025-12-17', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.50, -- Input price per M tokens
        3.00, -- Output price per M tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Gemini 3 Flash pricing on Google as of December 2025. Released December 17, 2025 (also known as Gemini 2.0 Flash). API name is gemini-3-flash-preview (Host API ID: fiercefalcon). Features 1 million token input context window, 64,000 output capacity, and knowledge cutoff of January 1, 2025. Achieves state-of-the-art performance with Intelligence Index of 71, including top scores in MMLU-Pro (89%), GPQA Diamond (90%), and second highest on MMMU-Pro for multimodal reasoning. Highest score on AA-Omniscience knowledge benchmark. Supports multimodal input (text, image, video, audio), tool calling, structured outputs, and JSON mode. Output speed: 218 tokens per second. Blended rate: $1.125 per 1M tokens.'
    );

-- ============================================
-- GPT-5.2
-- ============================================

-- Use existing OpenAI Vendor ID
DECLARE @OpenAIVendorID UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E';

-- Model ID for GPT-5.2
DECLARE @GPT52ModelID UNIQUEIDENTIFIER = '318BDCAD-FF2A-45E4-AB51-98754DF08E7A';

-- 5. Create GPT-5.2 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @GPT52ModelID,
        'GPT-5.2',
        'OpenAI''s enterprise-focused model with 400k token input context window and 128k output capacity. Features advanced reasoning capabilities optimized for complex, structured work and long-running agents. Includes response compaction via /responses/compact endpoint with loss-aware compression. Available in three tiers: Instant (speed-optimized), Thinking (deep reasoning), and Pro (highest accuracy). Knowledge cutoff of August 2025.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        11, -- PowerRank (advanced enterprise model with reasoning capabilities)
        8, -- SpeedRank (varies by tier - Instant faster, Thinking slower)
        9  -- CostRank (premium pricing - $1.75 input, $14 output per 1M tokens for standard tier)
    );

-- 6. Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'F7108A95-C614-409C-8703-EDAAA89DB047',
        @GPT52ModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        1, -- SupportsEffortLevel (has reasoning variants)
        0  -- SupportsStreaming (0 for developer role)
    );

-- 7. Create AI Model Vendor association for OpenAI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '5066102E-2052-4790-9D75-CF100F6FF5F8',
        @GPT52ModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-5.2', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel (reasoning capability)
        1, -- SupportsStreaming
        'OpenAILLM', -- Driver class
        NULL, -- DriverImportPath (usually NULL)
        400000, -- MaxInputTokens (400k context window)
        128000  -- MaxOutputTokens (128k output capacity)
    );

-- 8. Add cost tracking record for OpenAI pricing
-- Note: GPT-5.2 has tiered pricing (standard, Instant, Thinking, Pro).
-- Base tier pricing shown. Pro tier is significantly higher ($21/$168 per 1M tokens).
-- Cached input pricing available at 10x reduction ($0.175 per 1M tokens).
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '9D881C58-7846-4839-84E3-F51F0D32B02B',
        @GPT52ModelID,
        @OpenAIVendorID,
        '2025-12-11', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.75, -- Input price per M tokens (standard tier)
        14.00, -- Output price per M tokens (standard tier)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5.2 pricing on OpenAI as of December 2025. Base tier pricing shown ($1.75/$14.00 per 1M tokens). Tiered pricing available: GPT-5.2 Instant (speed-optimized for daily tasks), GPT-5.2 Thinking (deep reasoning for complex structured work), GPT-5.2 Pro ($21/$168 per 1M tokens - highest accuracy). Cached input pricing available at 10x reduction ($0.175 per 1M tokens). Batch API offers 50% discounts. Released December 11, 2025 (codenamed "garlic"). API name is gpt-5.2. Features 400,000 token input context window, 128,000 output capacity, and knowledge cutoff of August 31, 2025. Supports streaming, function calling, structured outputs, and response compaction via /responses/compact endpoint for long-running tool-heavy workflows with loss-aware compression. 1.4x the cost of GPT-5.1.'
    );
