-- Migration to add LocalEmbeddings provider and models to MemberJunction
-- This adds support for running embedding models locally using Transformers.js

-- Declare variables for IDs
DECLARE @VendorID UNIQUEIDENTIFIER = 'FE9D9CEA-5CEB-4EF0-8E2B-D18BF5289627';
DECLARE @EmbeddingsTypeID UNIQUEIDENTIFIER = 'EAA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Existing Embeddings type
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3'; -- Inference Provider type

-- Model IDs
DECLARE @MiniLML6ID UNIQUEIDENTIFIER = '1302E01E-6E69-42BE-BF00-DFF764FC63FE';
DECLARE @MiniLML12ID UNIQUEIDENTIFIER = '2E328C31-9B9D-4E78-B084-C8381BC82F2F';
DECLARE @MPNetID UNIQUEIDENTIFIER = '1D45AA65-41EC-4572-9ECD-AB2826C9B059';
DECLARE @MultilingualID UNIQUEIDENTIFIER = '113FE682-82DB-487D-B943-472D130DAC53';
DECLARE @GTESmallID UNIQUEIDENTIFIER = '43536203-DA8C-4232-B1A7-2D46E525B6CD';
DECLARE @BGESmallID UNIQUEIDENTIFIER = '521F4AEE-A724-4190-8728-ADB47E9F39D1';

-- AIModelVendor IDs
DECLARE @MV_MiniLML6ID UNIQUEIDENTIFIER = 'E040584B-62A8-414D-A551-60A5A893CD0C';
DECLARE @MV_MiniLML12ID UNIQUEIDENTIFIER = 'B41FBD16-AF45-41E9-B3EC-C5B937A3FAD3';
DECLARE @MV_MPNetID UNIQUEIDENTIFIER = '8665588B-B717-4AFF-8AE9-7A0E60832CFB';
DECLARE @MV_MultilingualID UNIQUEIDENTIFIER = '4FF91CF1-4C79-4A26-869B-EA9DE3CC1F46';
DECLARE @MV_GTESmallID UNIQUEIDENTIFIER = 'A3DFC4DE-F499-4030-BB3E-0C05BB7A7EBB';
DECLARE @MV_BGESmallID UNIQUEIDENTIFIER = '54AA79BF-19CF-404E-9177-4E1A8B9EDDD4';

-- Check if vendor already exists before inserting
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendor WHERE ID = @VendorID)
BEGIN
    -- Insert LocalEmbeddings vendor (only has ID, Name, Description fields)
    INSERT INTO ${flyway:defaultSchema}.AIVendor (
        ID,
        Name,
        Description
    )
    VALUES (
        @VendorID,
        'LocalEmbeddings',
        'Local embedding provider that runs models directly on your infrastructure using Transformers.js and ONNX runtime. Provides privacy-focused, cost-effective embeddings without requiring external API calls.'
    );
END

-- Insert AI Models for LocalEmbeddings
-- AIModel table only has: ID, Name, Description, AIModelTypeID, PowerRank, IsActive, SpeedRank, CostRank, ModelSelectionInsights

-- 1. all-MiniLM-L6-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = @MiniLML6ID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (
        ID,
        Name,
        Description,
        AIModelTypeID,
        IsActive,
        PowerRank,
        SpeedRank,
        CostRank,
        ModelSelectionInsights
    )
    VALUES (
        @MiniLML6ID,
        'all-MiniLM-L6-v2 (Local)',
        'Lightweight general-purpose sentence embeddings model. Optimized for speed while maintaining good quality. Runs locally via Transformers.js.',
        @EmbeddingsTypeID,
        1,
        6,  -- Good power for lightweight model
        10, -- Very fast
        0,  -- Free (local compute only)
        'Best for: Quick semantic search, similarity detection, and clustering tasks where speed is prioritized. 384-dimensional output. Supports up to 256 tokens input. Not ideal for: Complex domain-specific embeddings or multilingual content.'
    );
END

-- 2. all-MiniLM-L12-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = @MiniLML12ID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (
        ID,
        Name,
        Description,
        AIModelTypeID,
        IsActive,
        PowerRank,
        SpeedRank,
        CostRank,
        ModelSelectionInsights
    )
    VALUES (
        @MiniLML12ID,
        'all-MiniLM-L12-v2 (Local)',
        'Higher quality sentence embeddings with more layers. Better accuracy than L6 variant. Runs locally via Transformers.js.',
        @EmbeddingsTypeID,
        1,
        7,  -- Better power than L6
        8,  -- Slightly slower than L6
        0,  -- Free
        'Best for: Applications requiring better semantic understanding while maintaining reasonable speed. 384-dimensional output. Supports up to 256 tokens. Good balance of quality and performance.'
    );
END

-- 3. all-mpnet-base-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = @MPNetID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (
        ID,
        Name,
        Description,
        AIModelTypeID,
        IsActive,
        PowerRank,
        SpeedRank,
        CostRank,
        ModelSelectionInsights
    )
    VALUES (
        @MPNetID,
        'all-mpnet-base-v2 (Local)',
        'Best quality general-purpose sentence embeddings. Highest accuracy but larger model size. Runs locally via Transformers.js.',
        @EmbeddingsTypeID,
        1,
        9,  -- Excellent power
        6,  -- Slower due to size
        0,  -- Free
        'Best for: Applications where embedding quality is critical. 768-dimensional output provides richer representations. Supports up to 384 tokens. Ideal for: Knowledge bases, document similarity, and advanced semantic search. Trade-off: Slower inference and higher memory usage.'
    );
END

-- 4. paraphrase-multilingual-MiniLM-L12-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = @MultilingualID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (
        ID,
        Name,
        Description,
        AIModelTypeID,
        IsActive,
        PowerRank,
        SpeedRank,
        CostRank,
        ModelSelectionInsights
    )
    VALUES (
        @MultilingualID,
        'paraphrase-multilingual-MiniLM-L12-v2 (Local)',
        'Multilingual sentence embeddings supporting 50+ languages. Ideal for international applications. Runs locally via Transformers.js.',
        @EmbeddingsTypeID,
        1,
        7,  -- Good power for multilingual
        7,  -- Moderate speed
        0,  -- Free
        'Best for: Multilingual applications, cross-language similarity search, and international content. Supports 50+ languages including English, Spanish, Chinese, Arabic, etc. 384-dimensional output. Limited to 128 tokens. Not ideal for: Monolingual English-only applications (use dedicated English models instead).'
    );
END

-- 5. gte-small
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = @GTESmallID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (
        ID,
        Name,
        Description,
        AIModelTypeID,
        IsActive,
        PowerRank,
        SpeedRank,
        CostRank,
        ModelSelectionInsights
    )
    VALUES (
        @GTESmallID,
        'gte-small (Local)',
        'General Text Embeddings - Small model for efficiency. Good balance of quality and speed. Runs locally via Transformers.js.',
        @EmbeddingsTypeID,
        1,
        7,  -- Good power
        9,  -- Fast
        0,  -- Free
        'Best for: General-purpose text embeddings with good performance. 384-dimensional output. Supports up to 512 tokens, making it suitable for longer texts. Recent model with improvements over older architectures.'
    );
END

-- 6. bge-small-en-v1.5
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = @BGESmallID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (
        ID,
        Name,
        Description,
        AIModelTypeID,
        IsActive,
        PowerRank,
        SpeedRank,
        CostRank,
        ModelSelectionInsights
    )
    VALUES (
        @BGESmallID,
        'bge-small-en-v1.5 (Local)',
        'BAAI General Embeddings - Small English model. State-of-the-art performance for English text. Runs locally via Transformers.js.',
        @EmbeddingsTypeID,
        1,
        8,  -- Very good power
        9,  -- Fast
        0,  -- Free
        'Best for: English-only applications requiring high-quality embeddings. 384-dimensional output. Supports up to 512 tokens. Excellent for retrieval tasks, RAG systems, and semantic search. One of the best performing small models for English.'
    );
END

-- Insert AIModelVendor entries to map models to vendor with proper API names and driver class
-- AIModelVendor links models to vendors and provides API configuration

-- 1. AIModelVendor for all-MiniLM-L6-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelVendor WHERE ID = @MV_MiniLML6ID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (
        ID,
        ModelID,
        VendorID,
        TypeID,
        DriverClass,
        APIName,
        Priority,
        Status,
        SupportsStreaming,
        MaxInputTokens,
        MaxOutputTokens,
        SupportedResponseFormats,
        SupportsEffortLevel
    )
    VALUES (
        @MV_MiniLML6ID,
        @MiniLML6ID,
        @VendorID,
        @InferenceProviderTypeID,
        'LocalEmbedding',
        'Xenova/all-MiniLM-L6-v2',  -- Hugging Face model ID for Transformers.js
        1,
        'Active',
        0, -- No streaming for embeddings
        256,
        384, -- Output dimensionality stored here
        'Any',
        0
    );
END

-- 2. AIModelVendor for all-MiniLM-L12-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelVendor WHERE ID = @MV_MiniLML12ID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (
        ID,
        ModelID,
        VendorID,
        TypeID,
        DriverClass,
        APIName,
        Priority,
        Status,
        SupportsStreaming,
        MaxInputTokens,
        MaxOutputTokens,
        SupportedResponseFormats,
        SupportsEffortLevel
    )
    VALUES (
        @MV_MiniLML12ID,
        @MiniLML12ID,
        @VendorID,
        @InferenceProviderTypeID,
        'LocalEmbedding',
        'Xenova/all-MiniLM-L12-v2',
        1,
        'Active',
        0,
        256,
        384,
        'Any',
        0
    );
END

-- 3. AIModelVendor for all-mpnet-base-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelVendor WHERE ID = @MV_MPNetID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (
        ID,
        ModelID,
        VendorID,
        TypeID,
        DriverClass,
        APIName,
        Priority,
        Status,
        SupportsStreaming,
        MaxInputTokens,
        MaxOutputTokens,
        SupportedResponseFormats,
        SupportsEffortLevel
    )
    VALUES (
        @MV_MPNetID,
        @MPNetID,
        @VendorID,
        @InferenceProviderTypeID,
        'LocalEmbedding',
        'Xenova/all-mpnet-base-v2',
        1,
        'Active',
        0,
        384,
        768, -- Higher output dimensions
        'Any',
        0
    );
END

-- 4. AIModelVendor for paraphrase-multilingual-MiniLM-L12-v2
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelVendor WHERE ID = @MV_MultilingualID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (
        ID,
        ModelID,
        VendorID,
        TypeID,
        DriverClass,
        APIName,
        Priority,
        Status,
        SupportsStreaming,
        MaxInputTokens,
        MaxOutputTokens,
        SupportedResponseFormats,
        SupportsEffortLevel
    )
    VALUES (
        @MV_MultilingualID,
        @MultilingualID,
        @VendorID,
        @InferenceProviderTypeID,
        'LocalEmbedding',
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        1,
        'Active',
        0,
        128,
        384,
        'Any',
        0
    );
END

-- 5. AIModelVendor for gte-small
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelVendor WHERE ID = @MV_GTESmallID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (
        ID,
        ModelID,
        VendorID,
        TypeID,
        DriverClass,
        APIName,
        Priority,
        Status,
        SupportsStreaming,
        MaxInputTokens,
        MaxOutputTokens,
        SupportedResponseFormats,
        SupportsEffortLevel
    )
    VALUES (
        @MV_GTESmallID,
        @GTESmallID,
        @VendorID,
        @InferenceProviderTypeID,
        'LocalEmbedding',
        'Xenova/gte-small',
        1,
        'Active',
        0,
        512,
        384,
        'Any',
        0
    );
END

-- 6. AIModelVendor for bge-small-en-v1.5
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelVendor WHERE ID = @MV_BGESmallID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (
        ID,
        ModelID,
        VendorID,
        TypeID,
        DriverClass,
        APIName,
        Priority,
        Status,
        SupportsStreaming,
        MaxInputTokens,
        MaxOutputTokens,
        SupportedResponseFormats,
        SupportsEffortLevel
    )
    VALUES (
        @MV_BGESmallID,
        @BGESmallID,
        @VendorID,
        @InferenceProviderTypeID,
        'LocalEmbedding',
        'Xenova/bge-small-en-v1.5',
        1,
        'Active',
        0,
        512,
        384,
        'Any',
        0
    );
END
 