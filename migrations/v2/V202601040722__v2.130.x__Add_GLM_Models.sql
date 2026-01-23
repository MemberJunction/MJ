-- Add Z.AI vendor and GLM 4.6/4.7 models
-- This migration adds:
-- 1. Z.AI (Zhipu AI) as a new AI Vendor (Model Developer)
-- 2. GLM 4.6 model with inference providers: OpenRouter, Cerebras
-- 3. GLM 4.7 model with inference provider: OpenRouter
-- 4. AIModelCost records for each vendor-model combination

-- ============================================
-- VARIABLE DECLARATIONS
-- ============================================

-- Z.AI Vendor ID (new)
DECLARE @ZAIVendorID UNIQUEIDENTIFIER = '9105874C-747B-49C6-80B2-3BBF83ABE29B';

-- Existing Vendor IDs
DECLARE @OpenRouterVendorID UNIQUEIDENTIFIER = '5AD8786B-2D00-45D5-AFBE-DAEC48963FFC';
DECLARE @CerebrasVendorID UNIQUEIDENTIFIER = '3EDA433E-F36B-1410-8DB6-00021F8B792E';

-- Model IDs
DECLARE @GLM46ModelID UNIQUEIDENTIFIER = '8231B487-2D85-4515-9B7F-9EB2014011F5';
DECLARE @GLM47ModelID UNIQUEIDENTIFIER = '47C3B17A-2ABA-4F18-B2F6-8B62792F1EC7';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- Pricing type IDs
DECLARE @StandardTokenPricingTypeID UNIQUEIDENTIFIER = 'ece2bcb7-c854-4bf7-a517-d72793a40652';
DECLARE @PerMillionTokensUnitTypeID UNIQUEIDENTIFIER = '54208f7d-331c-40ab-84e8-163338ee9ea1';

-- ============================================
-- Z.AI VENDOR
-- ============================================

-- 1. Create Z.AI vendor record
INSERT INTO [${flyway:defaultSchema}].[AIVendor]
    (ID, Name, Description)
VALUES
    (
        @ZAIVendorID,
        'Z.AI',
        'Zhipu AI - Chinese AI company and pioneer in large language models. Develops the GLM (General Language Model) series including GLM-4.x models with strong coding and agentic capabilities.'
    );

-- 2. Create Z.AI vendor type for model developer
INSERT INTO [${flyway:defaultSchema}].[AIVendorType]
    (ID, VendorID, TypeID, Rank, Status)
VALUES
    (
        'BDDC27BB-0A70-4A31-B30B-92BAC3F87B0F',
        @ZAIVendorID,
        @ModelDeveloperTypeID,
        5, -- Rank
        'Active'
    );

-- ============================================
-- GLM 4.6
-- ============================================

-- 3. Create GLM 4.6 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @GLM46ModelID,
        'GLM 4.6',
        'Z.AI''s (Zhipu AI) flagship model with Mixture-of-Experts architecture. 355B total parameters (32B active) with 200K token context window. Excels at agentic workflows, coding (LiveCodeBench v6 #1), and tool-augmented problem-solving. Supports function calling, structured outputs, and native tool invocation. MIT license.',
        @LLMTypeID,
        1, -- IsActive
        9, -- PowerRank (strong benchmark performance)
        8, -- SpeedRank (MoE architecture, fast on Cerebras)
        3  -- CostRank (affordable on OpenRouter)
    );

-- 4. Create AI Model Vendor association for Z.AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '3BEA188D-8B05-406D-AD06-01B403A5F22A',
        @GLM46ModelID,
        @ZAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 5. Create AI Model Vendor association for OpenRouter as inference provider for GLM 4.6
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '36046E4E-48C1-4D6A-8170-6B27C008DA80',
        @GLM46ModelID,
        @OpenRouterVendorID,
        @InferenceProviderTypeID,
        'z-ai/glm-4.6', -- OpenRouter API name
        50, -- Priority (standard for OpenRouter)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenRouterLLM', -- Driver class
        NULL, -- DriverImportPath
        202752, -- MaxInputTokens (200K+ context window)
        65536  -- MaxOutputTokens
    );

-- 6. Create AI Model Vendor association for Cerebras as inference provider for GLM 4.6
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '67852107-4827-4A32-806C-B12091AF56F2',
        @GLM46ModelID,
        @CerebrasVendorID,
        @InferenceProviderTypeID,
        'zai-glm-4.6', -- Cerebras API name
        100, -- Priority (higher - Cerebras is ~1000 tok/s, very fast)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'CerebrasLLM', -- Driver class
        NULL, -- DriverImportPath
        202752, -- MaxInputTokens (200K+ context window)
        65536  -- MaxOutputTokens
    );

-- 7. Add cost tracking record for OpenRouter GLM 4.6 pricing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'A64B8B3D-0AFC-411D-864D-335B8D282424',
        @GLM46ModelID,
        @OpenRouterVendorID,
        '2025-09-30', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.35, -- Input price per M tokens
        1.50, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'GLM 4.6 pricing on OpenRouter as of September 2025. 355B parameter MoE model (32B active) with 200K context. Strong coding and agentic capabilities.'
    );

-- 8. Add cost tracking record for Cerebras GLM 4.6 pricing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'CC4C9603-8359-4BE3-A353-136412256782',
        @GLM46ModelID,
        @CerebrasVendorID,
        '2025-09-30', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        2.25, -- Input price per M tokens
        2.75, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'GLM 4.6 pricing on Cerebras as of late 2025. Ultra-fast inference at ~1000 tokens/sec. Preview model pricing - may change.'
    );

-- ============================================
-- GLM 4.7
-- ============================================

-- 9. Create GLM 4.7 model record (with PriorVersionID pointing to GLM 4.6)
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank, PriorVersionID)
VALUES
    (
        @GLM47ModelID,
        'GLM 4.7',
        'Z.AI''s (Zhipu AI) latest flagship model released December 2025. 355B total parameters (32B active) with 200K token context window and up to 128K output capacity. Features enhanced "Vibe Coding" for cleaner UI generation, improved multi-step reasoning stability, and strong agentic capabilities. SWE-bench Verified: 73.8%, LiveCodeBench-v6: 84.9%, AIME 2025: 95.7%.',
        @LLMTypeID,
        1, -- IsActive
        10, -- PowerRank (improved over 4.6)
        8, -- SpeedRank (55 tok/s on Z.AI)
        3, -- CostRank (affordable)
        @GLM46ModelID -- PriorVersionID - points to GLM 4.6
    );

-- 10. Create AI Model Vendor association for Z.AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'D19686D4-5594-4B4D-A62A-3B962F6F61DF',
        @GLM47ModelID,
        @ZAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 11. Create AI Model Vendor association for OpenRouter as inference provider for GLM 4.7
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '017FD34C-7EFF-4F16-9E15-3A2CEB72EDFB',
        @GLM47ModelID,
        @OpenRouterVendorID,
        @InferenceProviderTypeID,
        'z-ai/glm-4.7', -- OpenRouter API name
        50, -- Priority (standard for OpenRouter)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenRouterLLM', -- Driver class
        NULL, -- DriverImportPath
        202752, -- MaxInputTokens (200K+ context window)
        65535  -- MaxOutputTokens
    );

-- 12. Add cost tracking record for OpenRouter GLM 4.7 pricing
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'B9CC2748-2B3B-49B3-A2A3-6F3908ADF5A5',
        @GLM47ModelID,
        @OpenRouterVendorID,
        '2025-12-22', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.40, -- Input price per M tokens
        1.50, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'GLM 4.7 pricing on OpenRouter as of December 2025. Latest Z.AI flagship with enhanced coding ("Vibe Coding"), 200K context, up to 128K output. Strong SWE-bench and LiveCodeBench performance.'
    );