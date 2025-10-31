-- Add Grok 4 Fast models (grok-4-fast-reasoning and grok-4-fast-non-reasoning)
-- This migration adds:
-- 1. Grok 4 Fast (Reasoning) as a new AI Model
-- 2. Grok 4 Fast (Non-Reasoning) as a new AI Model
-- 3. AIModelVendor associations for x.ai as the model developer for both models
-- 4. AIModelVendor associations for x.ai as the inference provider for both models
-- 5. Cost tracking records for x.ai pricing (unified pricing for both models)

-- Use existing x.ai Vendor ID from previous migration
DECLARE @xAIVendorID UNIQUEIDENTIFIER = '5483D98F-1F4E-40F4-91FC-EAA8EFDC90F1'; -- x.ai Vendor ID (existing)

-- Model IDs for the new models
DECLARE @Grok4FastReasoningModelID UNIQUEIDENTIFIER = 'B9C597E3-3AAF-4588-8EA8-92D85875B8A0';
DECLARE @Grok4FastNonReasoningModelID UNIQUEIDENTIFIER = 'F4E7A821-6D3C-4B9E-A7C5-8D1B4F2A9E6C';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Grok 4 Fast (Reasoning) model record
INSERT INTO ${flyway:defaultSchema}.AIModel
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Grok4FastReasoningModelID,
        'Grok 4 Fast (Reasoning)',
        'x.ai''s cost-efficient reasoning model with long chain-of-thought capabilities. Features a 2M token context window, frontier-level performance, and state-of-the-art search capabilities. Optimized for complex reasoning tasks while using 40% fewer thinking tokens than Grok 4.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        13, -- PowerRank (near frontier model with reasoning capabilities)
        8, -- SpeedRank (fast for a reasoning model)
        2  -- CostRank (15x cheaper than Grok 4 at $0.20/M input)
    );

-- 2. Create Grok 4 Fast (Non-Reasoning) model record
INSERT INTO ${flyway:defaultSchema}.AIModel
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Grok4FastNonReasoningModelID,
        'Grok 4 Fast (Non-Reasoning)',
        'x.ai''s cost-efficient non-reasoning model for quick responses. Features a 2M token context window with the same unified architecture as the reasoning version but optimized for faster, lighter use cases without chain-of-thought processing.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        11, -- PowerRank (strong model without reasoning overhead)
        10, -- SpeedRank (very fast due to no reasoning chains)
        2  -- CostRank (15x cheaper than Grok 4 at $0.20/M input)
    );

-- 3. Create AI Model Vendor associations for x.ai as model developer (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'B7D4F892-6C31-4A5E-9F82-3A9B7E4D8C56',
        @Grok4FastReasoningModelID,
        @xAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    (
        'C9E5FA03-7D42-4B6F-A094-4BAC8F5E9D67',
        @Grok4FastNonReasoningModelID,
        @xAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 4. Create AI Model Vendor associations for x.ai as inference provider (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'A3D5F812-9E64-4C71-B2A6-5CBD8F6FAE79',
        @Grok4FastReasoningModelID,
        @xAIVendorID,
        @InferenceProviderTypeID,
        'grok-4-fast-reasoning', -- x.ai API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'XAIService', -- Driver class following xAI provider pattern
        NULL, -- DriverImportPath (not needed for XAIService)
        2000000, -- MaxInputTokens (2M tokens context window)
        128000  -- MaxOutputTokens (128k based on documentation)
    ),
    (
        'E1C7BC25-9F64-4D81-C2B6-6DCD0A7FBF89',
        @Grok4FastNonReasoningModelID,
        @xAIVendorID,
        @InferenceProviderTypeID,
        'grok-4-fast-non-reasoning', -- x.ai API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'XAIService', -- Driver class following xAI provider pattern
        NULL, -- DriverImportPath (not needed for XAIService)
        2000000, -- MaxInputTokens (2M tokens context window)
        128000  -- MaxOutputTokens (128k based on documentation)
    );

-- 5. Add cost tracking records for x.ai pricing (both models have same pricing)
-- Note: Pricing is tiered but we use base pricing for simplicity
INSERT INTO ${flyway:defaultSchema}.AIModelCost
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'F2B8AD36-A075-4E92-D3C7-7EDE1A8BCB90',
        @Grok4FastReasoningModelID,
        @xAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.20, -- $0.20 per M input tokens (base tier, increases to $0.40 after 128k)
        0.50, -- $0.50 per M output tokens (base tier, increases to $1.00 for larger outputs)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Grok 4 Fast (Reasoning) base tier pricing on x.ai as of January 2025. Cached input tokens: $0.05/M. Tiered pricing applies for larger requests.'
    ),
    (
        'C3A9BE47-B186-4FA3-E4D8-8FEF2A9BDB01',
        @Grok4FastNonReasoningModelID,
        @xAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.20, -- $0.20 per M input tokens (base tier, increases to $0.40 after 128k)
        0.50, -- $0.50 per M output tokens (base tier, increases to $1.00 for larger outputs)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Grok 4 Fast (Non-Reasoning) base tier pricing on x.ai as of January 2025. Cached input tokens: $0.05/M. Tiered pricing applies for larger requests.'
    );
