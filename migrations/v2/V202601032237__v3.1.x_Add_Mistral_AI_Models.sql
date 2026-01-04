-- Add new Mistral AI models: Devstral 2, Mistral Large 3, Mistral Medium 3.1, Mistral Small 3.2
-- This migration adds:
-- 1. Four new AI Model records
-- 2. AIModelVendor associations for Mistral AI as model developer and inference provider
-- 3. AIModelCost records for each model

-- ============================================
-- VARIABLE DECLARATIONS
-- ============================================

-- Mistral AI Vendor ID (provided by user)
DECLARE @MistralVendorID UNIQUEIDENTIFIER = 'DBA5CCEC-6A37-EF11-86D4-000D3A4E707E';

-- Model IDs for new Mistral models
DECLARE @DevstralModelID UNIQUEIDENTIFIER = 'E4280B9A-76F3-4363-804A-8A3293BC5A85';
DECLARE @MistralLarge3ModelID UNIQUEIDENTIFIER = '742E556C-A75C-4B73-A762-639F1EF1CD4E';
DECLARE @MistralMedium31ModelID UNIQUEIDENTIFIER = 'A4704E68-B852-461D-9EBF-889164EB899C';
DECLARE @MistralSmall32ModelID UNIQUEIDENTIFIER = '2FDA1FD0-7E2B-42D6-AD6B-440F57B4EE1F';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- Pricing type IDs
DECLARE @StandardTokenPricingTypeID UNIQUEIDENTIFIER = 'ece2bcb7-c854-4bf7-a517-d72793a40652';
DECLARE @PerMillionTokensUnitTypeID UNIQUEIDENTIFIER = '54208f7d-331c-40ab-84e8-163338ee9ea1';

-- ============================================
-- DEVSTRAL 2
-- ============================================

-- 1. Create Devstral 2 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @DevstralModelID,
        'Devstral 2',
        'Mistral AI''s frontier code agents model for software engineering tasks. 123B parameters with 256K token context window. Excels at using tools to explore codebases, editing multiple files, and powering software engineering agents. Supports function calling, structured outputs, and built-in tools.',
        @LLMTypeID,
        1, -- IsActive
        9, -- PowerRank (strong coding capabilities)
        7, -- SpeedRank
        4  -- CostRank ($0.40 input, $2.00 output per 1M tokens)
    );

-- 2. Create AI Model Vendor association for Mistral AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '7185600A-F910-44E0-A9EF-74C6559D1167',
        @DevstralModelID,
        @MistralVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 3. Create AI Model Vendor association for Mistral AI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '78C494F7-5AB3-4145-AF43-687B29183245',
        @DevstralModelID,
        @MistralVendorID,
        @InferenceProviderTypeID,
        'devstral-2512', -- API name (exact versioned name)
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'MistralLLM', -- Driver class
        NULL, -- DriverImportPath
        256000, -- MaxInputTokens (256K context window)
        32000  -- MaxOutputTokens (estimated)
    );

-- 4. Add cost tracking record for Devstral 2
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '57410D23-A34C-4B0E-A320-FF30DE6046F1',
        @DevstralModelID,
        @MistralVendorID,
        '2025-12-09', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.40, -- Input price per M tokens
        2.00, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'Devstral 2 pricing on Mistral AI as of December 2025. 123B parameter model with 256K context. Optimized for software engineering agents and multi-file code editing. Note: Currently free for limited time, but standard pricing listed here.'
    );

-- ============================================
-- MISTRAL LARGE 3
-- ============================================

-- 5. Create Mistral Large 3 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @MistralLarge3ModelID,
        'Mistral Large 3',
        'Mistral AI''s flagship open-weight multimodal model with granular Mixture-of-Experts architecture. 675B total parameters (41B active) with 256K token context window. Supports vision, function calling, structured outputs, and agents. Apache 2.0 license with weights available on Hugging Face.',
        @LLMTypeID,
        1, -- IsActive
        9, -- PowerRank (flagship model)
        7, -- SpeedRank (MoE architecture for efficiency)
        3  -- CostRank ($0.50 input, $1.50 output per 1M tokens - good value for capability)
    );

-- 6. Create AI Model Vendor association for Mistral AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'C92418FD-7660-4DC6-B7ED-B72B9B6CE0C5',
        @MistralLarge3ModelID,
        @MistralVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 7. Create AI Model Vendor association for Mistral AI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '4D99CFBA-3D99-4DF5-8884-4E732F1AF5D1',
        @MistralLarge3ModelID,
        @MistralVendorID,
        @InferenceProviderTypeID,
        'mistral-large-2512', -- API name (exact versioned name)
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'MistralLLM', -- Driver class
        NULL, -- DriverImportPath
        256000, -- MaxInputTokens (256K context window)
        32000  -- MaxOutputTokens (estimated)
    );

-- 8. Add cost tracking record for Mistral Large 3
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '2265B1E1-273F-4771-A3E8-ED62DE426C6D',
        @MistralLarge3ModelID,
        @MistralVendorID,
        '2025-12-02', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.50, -- Input price per M tokens
        1.50, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'Mistral Large 3 pricing on Mistral AI as of December 2025. 675B parameter MoE model (41B active) with 256K context. Flagship multimodal model with vision capabilities. Open-weight with Apache 2.0 license.'
    );

-- ============================================
-- MISTRAL MEDIUM 3.1
-- ============================================

-- 9. Create Mistral Medium 3.1 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @MistralMedium31ModelID,
        'Mistral Medium 3.1',
        'Mistral AI''s frontier-class multimodal model with improved tone and performance. 128K token context window. Supports vision, OCR, function calling, structured outputs, and agents. Released August 2025.',
        @LLMTypeID,
        1, -- IsActive
        8, -- PowerRank (frontier-class)
        7, -- SpeedRank
        4  -- CostRank ($0.40 input, $2.00 output per 1M tokens)
    );

-- 10. Create AI Model Vendor association for Mistral AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '23B5C1DC-4CDD-49DC-A95F-29F2C9E32350',
        @MistralMedium31ModelID,
        @MistralVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 11. Create AI Model Vendor association for Mistral AI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '684B79A4-285B-4F75-937B-76BC26C63000',
        @MistralMedium31ModelID,
        @MistralVendorID,
        @InferenceProviderTypeID,
        'mistral-medium-2508', -- API name (exact versioned name)
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'MistralLLM', -- Driver class
        NULL, -- DriverImportPath
        128000, -- MaxInputTokens (128K context window)
        32000  -- MaxOutputTokens (estimated)
    );

-- 12. Add cost tracking record for Mistral Medium 3.1
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '419A9055-52D1-45EE-BF52-4B038C3F1C7E',
        @MistralMedium31ModelID,
        @MistralVendorID,
        '2025-08-12', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.40, -- Input price per M tokens
        2.00, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'Mistral Medium 3.1 pricing on Mistral AI as of August 2025. 128K context window. Frontier-class multimodal model with vision and OCR capabilities. Improved tone and performance over previous versions.'
    );

-- ============================================
-- MISTRAL SMALL 3.2
-- ============================================

-- 13. Create Mistral Small 3.2 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @MistralSmall32ModelID,
        'Mistral Small 3.2',
        'Mistral AI''s efficient 24B parameter multimodal model with vision capabilities. 128K token context window. Supports function calling, structured outputs, and agents. Open-weight model suitable for personal and commercial use. Very cost-effective.',
        @LLMTypeID,
        1, -- IsActive
        6, -- PowerRank (smaller but capable)
        8, -- SpeedRank (fast due to smaller size)
        1  -- CostRank ($0.10 input, $0.30 output per 1M tokens - very affordable)
    );

-- 14. Create AI Model Vendor association for Mistral AI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '664B8F55-5AA2-41FF-96ED-DF71001C3BFA',
        @MistralSmall32ModelID,
        @MistralVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- 15. Create AI Model Vendor association for Mistral AI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '5E1FA065-D57D-45AF-A1D1-8824D6045A91',
        @MistralSmall32ModelID,
        @MistralVendorID,
        @InferenceProviderTypeID,
        'mistral-small-2506', -- API name (exact versioned name)
        1, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'MistralLLM', -- Driver class
        NULL, -- DriverImportPath
        128000, -- MaxInputTokens (128K context window)
        32000  -- MaxOutputTokens (estimated)
    );

-- 16. Add cost tracking record for Mistral Small 3.2
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'DD278D28-370A-422E-908C-3551B35908FE',
        @MistralSmall32ModelID,
        @MistralVendorID,
        '2025-06-20', -- Model release date
        NULL,
        'Active',
        'USD',
        @StandardTokenPricingTypeID,
        0.10, -- Input price per M tokens
        0.30, -- Output price per M tokens
        @PerMillionTokensUnitTypeID,
        'Realtime',
        'Mistral Small 3.2 pricing on Mistral AI as of June 2025. 24B parameter model with 128K context. Efficient multimodal model with vision capabilities. Open-weight, very cost-effective option for personal and commercial use.'
    );
