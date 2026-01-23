-- Add Cerebras as inference provider for GLM-4.7
-- This migration adds:
-- 1. AIModelVendor association for GLM-4.7 with Cerebras (inference provider)
-- 2. AIModelCost records for Cerebras pricing
-- Note: GLM-4.7 model and Cerebras vendor already exist in the database

-- ============================================
-- VARIABLE DECLARATIONS
-- ============================================

-- Cerebras Vendor ID (existing)
DECLARE @CerebrasVendorID UNIQUEIDENTIFIER = '3EDA433E-F36B-1410-8DB6-00021F8B792E';

-- GLM-4.7 Model ID (existing)
DECLARE @GLM47ModelID UNIQUEIDENTIFIER = '47C3B17A-2ABA-4F18-B2F6-8B62792F1EC7';

-- Type IDs (standard from MemberJunction)
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- Pricing type IDs
DECLARE @StandardTokenPricingTypeID UNIQUEIDENTIFIER = 'ece2bcb7-c854-4bf7-a517-d72793a40652';
DECLARE @PerMillionTokensUnitTypeID UNIQUEIDENTIFIER = '54208f7d-331c-40ab-84e8-163338ee9ea1';

-- ============================================
-- ADD CEREBRAS AS INFERENCE PROVIDER FOR GLM-4.7
-- ============================================

-- Create AI Model Vendor association for Cerebras as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'B5E07348-4E10-4B9F-80C6-640709A646ED',
        @GLM47ModelID,
        @CerebrasVendorID,
        @InferenceProviderTypeID,
        'zai-glm-4.7', -- API name used by Cerebras (official model ID)
        2, -- Priority (lower than Z.ai's native offering)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'CerebrasLLM', -- Driver class (to be implemented)
        NULL, -- DriverImportPath
        128000, -- MaxInputTokens (GLM-4.7 context window)
        32000  -- MaxOutputTokens (estimated)
    );

-- ============================================
-- ADD COST RECORDS FOR CEREBRAS GLM-4.7
-- ============================================

-- Add cost tracking record for Cerebras GLM-4.7
-- Pricing based on Z.ai standard rates: $0.60 input, $2.00 output per 1M tokens
-- Cerebras delivers 10x better price-performance according to their marketing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'BC44A754-7CAC-4A46-A72C-C0B439D3EE07',
        @GLM47ModelID,
        @CerebrasVendorID,
        '2025-12-23', -- GLM-4.7 release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.60, -- Input price per M tokens (Z.ai standard pricing)
        2.00, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'Cerebras inference pricing for GLM-4.7 as of January 2026. Delivers 1,000-1,700 tokens/second with ~10x better price-performance than Claude Sonnet 4.5. Pay-as-you-go tier starts at $10 with generous rate limits (24M tokens/day).'
    );
