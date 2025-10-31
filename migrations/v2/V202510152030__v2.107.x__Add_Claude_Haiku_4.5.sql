-- Add Claude Haiku 4.5 model
-- This migration adds:
-- 1. Claude Haiku 4.5 as a new AI Model
-- 2. AIModelVendor associations for Anthropic as the model developer
-- 3. AIModelVendor associations for Anthropic as the inference provider
-- 4. Cost tracking record for Anthropic pricing

-- Use existing Anthropic Vendor ID
DECLARE @AnthropicVendorID UNIQUEIDENTIFIER = 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Anthropic Vendor ID (existing)

-- Model ID for the new model
DECLARE @ClaudeHaiku45ModelID UNIQUEIDENTIFIER = '4FD92457-0BA8-486F-978A-E5947154F4F4';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Claude Haiku 4.5 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @ClaudeHaiku45ModelID,
        'Claude Haiku 4.5',
        'Anthropic''s fastest and most affordable model with reasoning support. Features a 200K token context window (1M for developers), 64K max output tokens, and knowledge cutoff of February 2025. First Haiku model to support extended thinking and reasoning.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        4, -- PowerRank (capable model with reasoning support)
        12, -- SpeedRank (fastest model, more than twice the speed of Sonnet 4)
        2  -- CostRank ($1/M input, $5/M output - most affordable with reasoning)
    );

-- 2. Create AI Model Vendor association for Anthropic as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '78CB2342-9773-4A6A-A03C-3B9E5770E5EA',
        @ClaudeHaiku45ModelID,
        @AnthropicVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 3. Create AI Model Vendor association for Anthropic as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '8F0E2D8A-347B-45B0-86AC-11C8D84331B0',
        @ClaudeHaiku45ModelID,
        @AnthropicVendorID,
        @InferenceProviderTypeID,
        'claude-haiku-4-5-20251015', -- Anthropic API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel (first Haiku to support reasoning)
        1, -- SupportsStreaming
        'AnthropicLLM', -- Driver class following Anthropic provider pattern
        NULL, -- DriverImportPath (not needed for AnthropicLLM)
        200000, -- MaxInputTokens (200K tokens context window for standard users, 1M for developers)
        64000  -- MaxOutputTokens (64K tokens, up from 8K in Haiku 3.5)
    );

-- 4. Add cost tracking record for Anthropic pricing (standard tier)
-- Note: Pricing includes prompt caching (90% savings) and batch processing (50% savings) discounts
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'E6E3A5C4-40DC-4DD1-B7E8-245F2E129E66',
        @ClaudeHaiku45ModelID,
        @AnthropicVendorID,
        '2025-10-15', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.00, -- $1.00 per M input tokens (one-third the cost of Sonnet 4)
        5.00, -- $5.00 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Claude Haiku 4.5 pricing on Anthropic as of October 2025. Prompt caching available: up to 90% cost savings. Batch processing: 50% discount. Most affordable Anthropic model with reasoning support. Knowledge cutoff: February 2025.'
    );
