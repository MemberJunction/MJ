-- Add Image Generation AI Models (DALL-E 3, DALL-E 2, Gemini Image Generation)
-- This migration adds:
-- 1. AI Model records for image generation models
-- 2. AIModelVendor associations for OpenAI and Google as providers
-- 3. AIModelCost records for each model
-- 4. AIModelModality records for specific modality configurations

-- ============================================
-- VARIABLE DECLARATIONS
-- ============================================

-- Vendor IDs
DECLARE @OpenAIVendorID UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @GoogleVendorID UNIQUEIDENTIFIER = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E';

-- Model IDs for new image generation models
DECLARE @DALLE3ModelID UNIQUEIDENTIFIER = '4B9F8E72-1C5D-4A3E-B6F8-9D2E4A7C3B1A';
DECLARE @DALLE2ModelID UNIQUEIDENTIFIER = '8C2D6F4E-3A7B-49C1-A5E2-1F8D3C6B9E7A';
DECLARE @GeminiImageModelID UNIQUEIDENTIFIER = 'A1E5C9D3-7B2F-48E6-9A4C-5D8F1E3B7C2A';
DECLARE @Imagen3ModelID UNIQUEIDENTIFIER = 'C3F7A2E8-6D1B-4C5E-8F9A-2B4E6D8A1C3F';

-- Type IDs
DECLARE @ImageGeneratorTypeID UNIQUEIDENTIFIER = 'E9A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- Modality IDs
DECLARE @TextModalityID UNIQUEIDENTIFIER = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46';
DECLARE @ImageModalityID UNIQUEIDENTIFIER = 'AAD386E4-D6ED-4E6E-8960-B56AC1D2783B';

-- Pricing type IDs
DECLARE @ImageGenerationPricingTypeID UNIQUEIDENTIFIER = 'f8d3a2b1-c4e5-4f6a-9b8c-7d2e1a3f5c4d';
DECLARE @PerImageUnitTypeID UNIQUEIDENTIFIER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

-- Check if pricing types exist, if not create them
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelPriceType WHERE ID = @ImageGenerationPricingTypeID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelPriceType (ID, Name, Description)
    VALUES (@ImageGenerationPricingTypeID, 'Image Generation', 'Pricing per generated image at various quality levels and sizes');
END

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelPriceUnitType WHERE ID = @PerImageUnitTypeID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelPriceUnitType (ID, Name, Description)
    VALUES (@PerImageUnitTypeID, 'Per Image', 'Price per generated image');
END

-- ============================================
-- DALL-E 3
-- ============================================

-- 1. Create DALL-E 3 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @DALLE3ModelID,
        'DALL-E 3',
        'OpenAI''s most advanced image generation model. Creates highly detailed and accurate images from text prompts. Supports 1024x1024, 1024x1792, and 1792x1024 resolutions. May revise prompts for safety and quality. Standard and HD quality options available.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        10, -- PowerRank (highest quality)
        7, -- SpeedRank
        6  -- CostRank (premium pricing)
    );

-- 2. Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '2A4F6E8C-1B3D-4E5F-A7C9-8D2E1F3B5A7C',
        @DALLE3ModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 3. Create AI Model Vendor association for OpenAI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '9C8B7A6D-5E4F-3C2B-1A9D-8E7F6C5B4A3D',
        @DALLE3ModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'dall-e-3', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming (image generation doesn't stream)
        'OpenAIImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        4000, -- MaxInputTokens (prompt length limit)
        NULL  -- MaxOutputTokens (N/A for image generation)
    );

-- 4. Add cost tracking record for DALL-E 3 Standard 1024x1024
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'E1D2C3B4-A5F6-4E7D-8C9B-0A1F2E3D4C5B',
        @DALLE3ModelID,
        @OpenAIVendorID,
        '2023-11-06', -- Model release date
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.040, -- Output price per image (Standard 1024x1024)
        @PerImageUnitTypeID,
        'Realtime',
        'DALL-E 3 Standard quality 1024x1024 pricing as of January 2025. HD quality: $0.080/image. 1024x1792 and 1792x1024: Standard $0.080, HD $0.120.'
    );

-- ============================================
-- DALL-E 2
-- ============================================

-- 5. Create DALL-E 2 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @DALLE2ModelID,
        'DALL-E 2',
        'OpenAI''s previous generation image model. Supports 256x256, 512x512, and 1024x1024 resolutions. Unique features include image editing (inpainting) and image variations. More cost-effective for simple generation tasks.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        6, -- PowerRank (previous generation)
        8, -- SpeedRank (faster)
        3  -- CostRank (more affordable)
    );

-- 6. Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '3B5D7F9A-2C4E-6F8A-B1D3-9E7C5A3F1D8B',
        @DALLE2ModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 7. Create AI Model Vendor association for OpenAI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'A8C6E4B2-D1F3-5A7C-9E8B-7D6C5A4F3E2B',
        @DALLE2ModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'dall-e-2', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'OpenAIImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        1000, -- MaxInputTokens (prompt length limit)
        NULL  -- MaxOutputTokens
    );

-- 8. Add cost tracking record for DALL-E 2 1024x1024
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'F2E3D4C5-B6A7-8E9F-0A1B-2C3D4E5F6A7B',
        @DALLE2ModelID,
        @OpenAIVendorID,
        '2022-04-06', -- Model release date
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.020, -- Output price per image (1024x1024)
        @PerImageUnitTypeID,
        'Realtime',
        'DALL-E 2 1024x1024 pricing as of January 2025. 512x512: $0.018/image. 256x256: $0.016/image.'
    );

-- ============================================
-- Gemini 2.0 Flash (with Image Generation)
-- ============================================

-- 9. Create Gemini Image Generation model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @GeminiImageModelID,
        'Gemini 2.0 Flash Image',
        'Google Gemini 2.0 Flash experimental model with native image generation capabilities. Can generate images from text prompts and create variations of existing images. Part of Google''s multimodal Gemini family.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        8, -- PowerRank
        9, -- SpeedRank (Flash is fast)
        2  -- CostRank (cost-effective)
    );

-- 10. Create AI Model Vendor association for Google as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '4C6E8A2D-3F5B-7D9E-A1C3-8B4F6E2D9A5C',
        @GeminiImageModelID,
        @GoogleVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 11. Create AI Model Vendor association for Google as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'B9D7E5C3-A1F8-6B4E-2D9C-7A5F3E1B8D6C',
        @GeminiImageModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'gemini-2.0-flash-exp', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'GeminiImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        8192, -- MaxInputTokens
        NULL  -- MaxOutputTokens
    );

-- ============================================
-- Imagen 3
-- ============================================

-- 12. Create Imagen 3 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Imagen3ModelID,
        'Imagen 3',
        'Google''s highest quality text-to-image model. Generates photorealistic images with exceptional detail, rich lighting, and fewer artifacts. Supports various aspect ratios and styles. Available through Google Cloud Vertex AI.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        10, -- PowerRank (highest quality)
        6, -- SpeedRank
        5  -- CostRank
    );

-- 13. Create AI Model Vendor association for Google as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '5D7F9B1E-4A6C-8E2D-C3F5-9A7B1E3D5F8C',
        @Imagen3ModelID,
        @GoogleVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 14. Create AI Model Vendor association for Google as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'C1E3F5A7-B9D8-2C4E-6A8F-1D3B5E7C9A2F',
        @Imagen3ModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'imagen-3.0-generate-001', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'GeminiImageGenerator', -- Driver class (uses same SDK)
        NULL, -- DriverImportPath
        4096, -- MaxInputTokens
        NULL  -- MaxOutputTokens
    );

-- ============================================
-- AIModelModality records for additional modality support
-- (Beyond the defaults inherited from AIModelType)
-- ============================================

-- DALL-E 2 supports image input for editing and variations
INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
    (ID, ModelID, ModalityID, Direction, IsSupported, IsRequired, SupportedFormats, MaxSizeBytes, MaxDimension, Comments)
VALUES
    (
        '1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D',
        @DALLE2ModelID,
        @ImageModalityID,
        'Input',
        1, -- IsSupported
        0, -- IsRequired (optional for editing/variations)
        'png',
        4194304, -- 4MB max
        1024, -- Max dimension
        'DALL-E 2 accepts image input for editing (inpainting) and variations. Image must be PNG format, square, and less than 4MB.'
    );

-- Gemini Image supports image input for editing/variations
INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
    (ID, ModelID, ModalityID, Direction, IsSupported, IsRequired, SupportedFormats, MaxSizeBytes, MaxDimension, Comments)
VALUES
    (
        '2B3C4D5E-6F7A-8B9C-0D1E-2F3A4B5C6D7E',
        @GeminiImageModelID,
        @ImageModalityID,
        'Input',
        1, -- IsSupported
        0, -- IsRequired
        'png,jpg,webp,gif',
        20971520, -- 20MB max
        NULL, -- No specific dimension limit
        'Gemini 2.0 Flash accepts image input for editing and creating variations. Supports multiple image formats.'
    );

GO
