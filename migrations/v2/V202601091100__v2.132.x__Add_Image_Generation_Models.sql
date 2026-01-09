-- Add Image Generation AI Models (OpenAI GPT-4o Image, Google Nano Banana Pro, Black Forest Labs FLUX)
-- This migration adds:
-- 1. Black Forest Labs as a new AI Vendor
-- 2. AI Model records for image generation models
-- 3. AIModelVendor associations for OpenAI, Google, and Black Forest Labs as providers
-- 4. AIModelCost records for each model
-- 5. AIModelModality records for specific modality configurations

-- ============================================
-- VARIABLE DECLARATIONS
-- ============================================

-- Vendor IDs
DECLARE @OpenAIVendorID UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @GoogleVendorID UNIQUEIDENTIFIER = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @BFLVendorID UNIQUEIDENTIFIER = 'C7D8E9F0-A1B2-4C3D-5E6F-7A8B9C0D1E2F';

-- API Key credential type ID
DECLARE @APIKeyCredentialTypeID UNIQUEIDENTIFIER = '3F0C13AB-EF5F-4260-A50A-D66DDEC25270';

-- Model IDs for image generation models
DECLARE @GPTImage15ModelID UNIQUEIDENTIFIER = '4B9F8E72-1C5D-4A3E-B6F8-9D2E4A7C3B1A';
DECLARE @GPTImage1ModelID UNIQUEIDENTIFIER = '8C2D6F4E-3A7B-49C1-A5E2-1F8D3C6B9E7A';
DECLARE @NanoBananaProModelID UNIQUEIDENTIFIER = 'A1E5C9D3-7B2F-48E6-9A4C-5D8F1E3B7C2A';
DECLARE @FLUX2ProModelID UNIQUEIDENTIFIER = 'D4E5F6A7-B8C9-4D0E-1F2A-3B4C5D6E7F8A';
DECLARE @FLUX11ProModelID UNIQUEIDENTIFIER = 'E5F6A7B8-C9D0-4E1F-2A3B-4C5D6E7F8A9B';

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
-- BLACK FOREST LABS - NEW VENDOR
-- ============================================

-- Create Black Forest Labs vendor (creators of FLUX models)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendor WHERE ID = @BFLVendorID)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[AIVendor]
        (ID, Name, Description, CredentialTypeID)
    VALUES
        (
            @BFLVendorID,
            'Black Forest Labs',
            'Black Forest Labs is a frontier AI lab specializing in state-of-the-art image generation models. Creators of the FLUX model family, they offer both open-weights models for self-hosting and a production-ready API. Known for exceptional image quality, photorealism, and advanced editing capabilities.',
            @APIKeyCredentialTypeID
        );
END

-- ============================================
-- FLUX.2 Pro (Black Forest Labs - Latest)
-- ============================================

-- Create FLUX.2 Pro model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @FLUX2ProModelID,
        'FLUX.2 Pro',
        'Black Forest Labs'' most capable image generation model. A 32B parameter rectified flow transformer delivering photorealistic images up to 4MP resolution. Features exceptional detail accuracy in hands, faces, fabrics, and small objects. Supports image editing, multi-reference control (up to 8 reference images), and advanced prompt understanding.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        10, -- PowerRank (highest quality)
        7, -- SpeedRank
        6  -- CostRank
    );

-- Create AI Model Vendor association for BFL as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'F1A2B3C4-D5E6-4F7A-8B9C-0D1E2F3A4B5C',
        @FLUX2ProModelID,
        @BFLVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Create AI Model Vendor association for BFL as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'A2B3C4D5-E6F7-4A8B-9C0D-1E2F3A4B5C6D',
        @FLUX2ProModelID,
        @BFLVendorID,
        @InferenceProviderTypeID,
        'flux-2-pro', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'FLUXImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        10000, -- MaxInputTokens (prompt length)
        NULL  -- MaxOutputTokens
    );

-- Add cost tracking record for FLUX.2 Pro
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'B3C4D5E6-F7A8-4B9C-0D1E-2F3A4B5C6D7E',
        @FLUX2ProModelID,
        @BFLVendorID,
        '2025-10-01', -- Approximate release date
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.030, -- Output price per image (~$0.03/image via Together AI)
        @PerImageUnitTypeID,
        'Realtime',
        'FLUX.2 Pro pricing as of January 2026. Standard pricing approximately $0.03/image. Uses megapixel-based pricing where cost scales with output resolution. 1 credit = $0.01 USD on BFL API.'
    );

-- ============================================
-- FLUX 1.1 Pro (Black Forest Labs)
-- ============================================

-- Create FLUX 1.1 Pro model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @FLUX11ProModelID,
        'FLUX 1.1 Pro',
        'Black Forest Labs'' production-ready image generation model. Offers excellent image quality with fast generation times. Well-suited for high-volume production workloads. Supports standard image generation with good prompt adherence and style control.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        9, -- PowerRank (excellent quality)
        8, -- SpeedRank (faster than FLUX.2)
        4  -- CostRank (cost-effective)
    );

-- Create AI Model Vendor association for BFL as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'C4D5E6F7-A8B9-4C0D-1E2F-3A4B5C6D7E8F',
        @FLUX11ProModelID,
        @BFLVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Create AI Model Vendor association for BFL as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'D5E6F7A8-B9C0-4D1E-2F3A-4B5C6D7E8F9A',
        @FLUX11ProModelID,
        @BFLVendorID,
        @InferenceProviderTypeID,
        'flux-1.1-pro', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'FLUXImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        10000, -- MaxInputTokens (prompt length)
        NULL  -- MaxOutputTokens
    );

-- Add cost tracking record for FLUX 1.1 Pro
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'E6F7A8B9-C0D1-4E2F-3A4B-5C6D7E8F9A0B',
        @FLUX11ProModelID,
        @BFLVendorID,
        '2025-10-01', -- Release date from announcement
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.040, -- Output price per image ($0.04/image)
        @PerImageUnitTypeID,
        'Realtime',
        'FLUX 1.1 Pro pricing as of January 2026. $0.04/image standard resolution. Credit-based pricing on BFL API (1 credit = $0.01).'
    );

-- ============================================
-- GPT-4o Image 1.5 (Latest)
-- ============================================

-- 1. Create GPT-4o Image 1.5 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @GPTImage15ModelID,
        'GPT-4o Image 1.5',
        'OpenAI''s latest native multimodal image generation model (December 2025). Built on GPT-4o architecture for exceptional image quality. Supports up to 2K resolution, HD quality, and advanced prompt understanding. Includes editing and variation capabilities.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        10, -- PowerRank (highest quality)
        8, -- SpeedRank
        7  -- CostRank (premium pricing)
    );

-- 2. Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '2A4F6E8C-1B3D-4E5F-A7C9-8D2E1F3B5A7C',
        @GPTImage15ModelID,
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
        @GPTImage15ModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-image-1.5', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming (image generation doesn't stream)
        'OpenAIImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        8000, -- MaxInputTokens (prompt length limit)
        NULL  -- MaxOutputTokens (N/A for image generation)
    );

-- 4. Add cost tracking record for GPT-4o Image 1.5
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'E1D2C3B4-A5F6-4E7D-8C9B-0A1F2E3D4C5B',
        @GPTImage15ModelID,
        @OpenAIVendorID,
        '2025-12-01', -- Model release date
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.080, -- Output price per image (Standard quality)
        @PerImageUnitTypeID,
        'Realtime',
        'GPT-4o Image 1.5 pricing as of January 2026. Standard quality 1024x1024: $0.080/image. HD quality: $0.120/image. 2048x2048: $0.160/image.'
    );

-- ============================================
-- GPT-4o Image 1.0
-- ============================================

-- 5. Create GPT-4o Image 1.0 model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @GPTImage1ModelID,
        'GPT-4o Image 1.0',
        'OpenAI''s first GPT-4o native image generation model (April 2025). Multimodal architecture enables natural image generation from text. Supports multiple sizes and formats. Cost-effective option for standard quality needs.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        8, -- PowerRank (previous generation)
        8, -- SpeedRank
        5  -- CostRank (more affordable)
    );

-- 6. Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '3B5D7F9A-2C4E-6F8A-B1D3-9E7C5A3F1D8B',
        @GPTImage1ModelID,
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
        @GPTImage1ModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-image-1', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'OpenAIImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        6000, -- MaxInputTokens (prompt length limit)
        NULL  -- MaxOutputTokens
    );

-- 8. Add cost tracking record for GPT-4o Image 1.0
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'F2E3D4C5-B6A7-8E9F-0A1B-2C3D4E5F6A7B',
        @GPTImage1ModelID,
        @OpenAIVendorID,
        '2025-04-01', -- Model release date
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.040, -- Output price per image (Standard quality)
        @PerImageUnitTypeID,
        'Realtime',
        'GPT-4o Image 1.0 pricing as of January 2026. Standard quality 1024x1024: $0.040/image. HD quality: $0.080/image.'
    );

-- ============================================
-- Gemini 3 Pro Image (Nano Banana Pro)
-- ============================================

-- 9. Create Nano Banana Pro model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @NanoBananaProModelID,
        'Nano Banana Pro',
        'Google''s most advanced image generation model (November 2025), officially Gemini 3 Pro Image. Exceptional quality with support for up to 4K resolution (3840x2160). Features advanced style control, negative prompts, and seed-based reproducibility. State-of-the-art prompt understanding and image editing capabilities.',
        @ImageGeneratorTypeID,
        1, -- IsActive
        10, -- PowerRank (highest quality)
        8, -- SpeedRank
        6  -- CostRank
    );

-- 10. Create AI Model Vendor association for Google as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '4C6E8A2D-3F5B-7D9E-A1C3-8B4F6E2D9A5C',
        @NanoBananaProModelID,
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
        @NanoBananaProModelID,
        @GoogleVendorID,
        @InferenceProviderTypeID,
        'gemini-3-pro-image-preview', -- API name
        1, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0, -- SupportsStreaming
        'GeminiImageGenerator', -- Driver class
        NULL, -- DriverImportPath
        12000, -- MaxInputTokens
        NULL  -- MaxOutputTokens
    );

-- 12. Add cost tracking record for Nano Banana Pro
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'C3A4B5D6-E7F8-9A0B-1C2D-3E4F5A6B7C8D',
        @NanoBananaProModelID,
        @GoogleVendorID,
        '2025-11-01', -- Model release date
        NULL,
        'Active',
        'USD',
        @ImageGenerationPricingTypeID,
        0.00, -- Input price (N/A)
        0.050, -- Output price per image (1024x1024)
        @PerImageUnitTypeID,
        'Realtime',
        'Gemini 3 Pro Image (Nano Banana Pro) pricing as of January 2026. 1024x1024: $0.050/image. 2048x2048: $0.100/image. 4K resolution: $0.200/image.'
    );

-- ============================================
-- AIModelModality records for additional modality support
-- (Beyond the defaults inherited from AIModelType)
-- ============================================

-- GPT-4o Image 1.5 supports image input for editing and variations
INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
    (ID, ModelID, ModalityID, Direction, IsSupported, IsRequired, SupportedFormats, MaxSizeBytes, MaxDimension, Comments)
VALUES
    (
        '1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D',
        @GPTImage15ModelID,
        @ImageModalityID,
        'Input',
        1, -- IsSupported
        0, -- IsRequired (optional for editing/variations)
        'png,jpg,webp',
        20971520, -- 20MB max
        4096, -- Max dimension
        'GPT-4o Image 1.5 accepts image input for editing and variations. Supports multiple formats up to 20MB.'
    );

-- Nano Banana Pro supports image input for editing/variations
INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
    (ID, ModelID, ModalityID, Direction, IsSupported, IsRequired, SupportedFormats, MaxSizeBytes, MaxDimension, Comments)
VALUES
    (
        '2B3C4D5E-6F7A-8B9C-0D1E-2F3A4B5C6D7E',
        @NanoBananaProModelID,
        @ImageModalityID,
        'Input',
        1, -- IsSupported
        0, -- IsRequired
        'png,jpg,webp,gif,heic',
        52428800, -- 50MB max
        NULL, -- No specific dimension limit
        'Gemini 3 Pro Image (Nano Banana Pro) accepts image input for editing and creating variations. Supports multiple image formats including HEIC.'
    );

-- FLUX.2 Pro supports image input for editing and multi-reference control
INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
    (ID, ModelID, ModalityID, Direction, IsSupported, IsRequired, SupportedFormats, MaxSizeBytes, MaxDimension, Comments)
VALUES
    (
        '3C4D5E6F-7A8B-9C0D-1E2F-3A4B5C6D7E8F',
        @FLUX2ProModelID,
        @ImageModalityID,
        'Input',
        1, -- IsSupported
        0, -- IsRequired (optional for editing/multi-reference)
        'png,jpg,webp',
        52428800, -- 50MB max
        4096, -- Max dimension
        'FLUX.2 Pro accepts image input for editing and multi-reference control. Supports up to 8 reference images via API for character and product consistency.'
    );

-- FLUX 1.1 Pro supports image input for variations
INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
    (ID, ModelID, ModalityID, Direction, IsSupported, IsRequired, SupportedFormats, MaxSizeBytes, MaxDimension, Comments)
VALUES
    (
        '4D5E6F7A-8B9C-0D1E-2F3A-4B5C6D7E8F9A',
        @FLUX11ProModelID,
        @ImageModalityID,
        'Input',
        1, -- IsSupported
        0, -- IsRequired
        'png,jpg,webp',
        52428800, -- 50MB max
        4096, -- Max dimension
        'FLUX 1.1 Pro accepts image input for image-to-image generation and variations.'
    );

GO
