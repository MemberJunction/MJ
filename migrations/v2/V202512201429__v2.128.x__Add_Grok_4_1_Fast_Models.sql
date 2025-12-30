-- Add Grok 4-1 Fast Reasoning and Non-Reasoning models
-- This migration adds:
-- 1. grok-4-1-fast-reasoning as a new AI Model
-- 2. AIModelVendor associations for x.AI as the model developer and inference provider
-- 3. Cost tracking record for x.AI pricing
-- 4. grok-4-1-fast-non-reasoning as a new AI Model
-- 5. AIModelVendor associations for x.AI as the model developer and inference provider
-- 6. Cost tracking record for x.AI pricing

-- ============================================
-- GROK 4-1 FAST REASONING
-- ============================================

-- Use existing x.AI Vendor ID
DECLARE @xAIVendorID UNIQUEIDENTIFIER = '5483D98F-1F4E-40F4-91FC-EAA8EFDC90F1';

-- Model IDs for Grok models
DECLARE @Grok41FastReasoningModelID UNIQUEIDENTIFIER = 'E7B8A63A-BE53-42FD-9401-02E07901D7F1';
DECLARE @Grok41FastNonReasoningModelID UNIQUEIDENTIFIER = '33FF4A6E-6162-48DF-832A-8C936DCD4AC7';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Grok 4-1 Fast Reasoning model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Grok41FastReasoningModelID,
        'Grok 4-1 Fast Reasoning',
        'x.AI''s fast reasoning model with 2M token context window. Features reasoning capabilities with JSON and function calling support. Optimized for speed while maintaining reasoning depth. Rate limited to 4M tokens per minute and 480 requests per minute.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        8, -- PowerRank (reasoning capability)
        9, -- SpeedRank (fast variant optimized for speed)
        2  -- CostRank (affordable - $0.20 input, $0.50 output per 1M tokens)
    );

-- 2. Create AI Model Vendor association for x.AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'B7DFA757-4BBF-4985-BA46-459F4C152686',
        @Grok41FastReasoningModelID,
        @xAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 3. Create AI Model Vendor association for x.AI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'EF3CDBAF-DBF4-4AE6-819D-F0E50A58FDA4',
        @Grok41FastReasoningModelID,
        @xAIVendorID,
        @InferenceProviderTypeID,
        'grok-4-1-fast-reasoning', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'xAILLM', -- Driver class
        NULL, -- DriverImportPath (usually NULL)
        2000000, -- MaxInputTokens (2M token context window)
        128000  -- MaxOutputTokens (estimated based on similar models)
    );

-- 4. Add cost tracking record for x.AI pricing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'BC1FBC43-FE9C-41FE-A073-4A1B64885466',
        @Grok41FastReasoningModelID,
        @xAIVendorID,
        '2025-12-20', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.20, -- Input price per M tokens
        0.50, -- Output price per M tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Grok 4-1 Fast Reasoning pricing on x.AI as of December 2025. Features 2 million token context window, reasoning capabilities, JSON mode, and function calling support. Rate limits: 4M tokens per minute (tpm), 480 requests per minute (rpm). Blended rate: $0.35 per 1M tokens.'
    );

-- ============================================
-- GROK 4-1 FAST NON-REASONING
-- ============================================

-- 5. Create Grok 4-1 Fast Non-Reasoning model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Grok41FastNonReasoningModelID,
        'Grok 4-1 Fast Non-Reasoning',
        'x.AI''s fast non-reasoning model with 2M token context window. Optimized for speed without extended reasoning overhead. Supports text and image input with function calling. Rate limited to 4M tokens per minute and 480 requests per minute.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        6, -- PowerRank (no reasoning, but still capable)
        10, -- SpeedRank (fastest variant without reasoning overhead)
        2  -- CostRank (affordable - $0.20 input, $0.50 output per 1M tokens)
    );

-- 6. Create AI Model Vendor association for x.AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'BB55BBE4-D63E-4E26-A810-BBBE683CE629',
        @Grok41FastNonReasoningModelID,
        @xAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 7. Create AI Model Vendor association for x.AI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'A3165BF4-2856-459F-9A4B-9E13798FB811',
        @Grok41FastNonReasoningModelID,
        @xAIVendorID,
        @InferenceProviderTypeID,
        'grok-4-1-fast-non-reasoning', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'xAILLM', -- Driver class
        NULL, -- DriverImportPath (usually NULL)
        2000000, -- MaxInputTokens (2M token context window)
        128000  -- MaxOutputTokens (estimated based on similar models)
    );

-- 8. Add cost tracking record for x.AI pricing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '4B2D96C7-66EA-4170-9930-ED49CA4C4BE4',
        @Grok41FastNonReasoningModelID,
        @xAIVendorID,
        '2025-12-20', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.20, -- Input price per M tokens
        0.50, -- Output price per M tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Grok 4-1 Fast Non-Reasoning pricing on x.AI as of December 2025. Features 2 million token context window, multimodal input (text and images), JSON mode, and function calling support. Optimized for speed without reasoning overhead. Rate limits: 4M tokens per minute (tpm), 480 requests per minute (rpm). Blended rate: $0.35 per 1M tokens.'
    );
