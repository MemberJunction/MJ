-- Phase 4: Reranking Framework
-- Adds Reranker model type, RerankerConfiguration to AIAgent, and Cohere reranker models
-- This migration supports two-stage retrieval with semantic reranking for agent memory

-- ============================================================================
-- 1. Add 'Reranker' AIModelType
-- ============================================================================
DECLARE @RerankerTypeID UNIQUEIDENTIFIER = '86E771DA-DC64-4E29-94B3-77403A0994C0';
DECLARE @TextModalityID UNIQUEIDENTIFIER;

-- Get Text modality ID for input/output modalities
SELECT @TextModalityID = ID FROM ${flyway:defaultSchema}.AIModality WHERE Name = 'Text';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelType WHERE Name = 'Reranker')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelType (ID, Name, Description, DefaultInputModalityID, DefaultOutputModalityID)
    VALUES (
        @RerankerTypeID,
        'Reranker',
        'Models that reorder search results based on query-document relevance. Used in two-stage retrieval to improve accuracy of RAG systems.',
        @TextModalityID,
        @TextModalityID
    );
END

-- ============================================================================
-- 2. Add RerankerConfiguration column to AIAgent table
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent') AND name = 'RerankerConfiguration')
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.AIAgent
    ADD RerankerConfiguration NVARCHAR(MAX) NULL;
END

-- ============================================================================
-- 3. Add Cohere as AI Vendor (if not exists)
-- ============================================================================
DECLARE @CohereVendorID UNIQUEIDENTIFIER = '9AF766B4-7720-4807-9C25-2836D685A7E1';
DECLARE @InferenceProviderTypeDefID UNIQUEIDENTIFIER;

-- Get Inference Provider type definition ID
SELECT @InferenceProviderTypeDefID = ID FROM ${flyway:defaultSchema}.AIVendorTypeDefinition WHERE Name = 'Inference Provider';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendor WHERE Name = 'Cohere')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description)
    VALUES (
        @CohereVendorID,
        'Cohere',
        'Cohere provides enterprise-grade NLP models including language models and specialized reranking models for improving RAG system accuracy.'
    );

    -- Add vendor type for Cohere (Inference Provider)
    IF @InferenceProviderTypeDefID IS NOT NULL
    BEGIN
        INSERT INTO ${flyway:defaultSchema}.AIVendorType (ID, VendorID, TypeID)
        VALUES (NEWID(), @CohereVendorID, @InferenceProviderTypeDefID);
    END
END
ELSE
BEGIN
    -- Get existing Cohere vendor ID if it already exists
    SELECT @CohereVendorID = ID FROM ${flyway:defaultSchema}.AIVendor WHERE Name = 'Cohere';
END

-- ============================================================================
-- 4. Add Cohere Reranker Models
-- ============================================================================
DECLARE @CohereRerank35ID UNIQUEIDENTIFIER = '1AF4B81D-B7A2-41E4-8514-E72A619E63DE';
DECLARE @CohereRerankMultilingualID UNIQUEIDENTIFIER = '2E8F662B-3842-41E1-87BF-3C14541BF93B';

-- Add rerank-v3.5 model (latest English reranker)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE Name = 'rerank-v3.5')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
    VALUES (
        @CohereRerank35ID,
        'rerank-v3.5',
        'Cohere Rerank v3.5 - Latest semantic reranking model with state-of-the-art performance for English content. Optimized for RAG retrieval quality improvement.',
        @RerankerTypeID,
        100,
        1
    );

    -- Add model-vendor association for rerank-v3.5
    -- TypeID references Inference Provider type definition
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, Priority, DriverClass, APIName, Status, TypeID)
    VALUES (
        'E0BEEDA5-7189-4E6A-9B60-BA65FA41B85F',
        @CohereRerank35ID,
        @CohereVendorID,
        1,
        'CohereReranker',
        'rerank-v3.5',
        'Active',
        @InferenceProviderTypeDefID
    );
END

-- Add rerank-multilingual-v3.0 model (multilingual reranker)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE Name = 'rerank-multilingual-v3.0')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
    VALUES (
        @CohereRerankMultilingualID,
        'rerank-multilingual-v3.0',
        'Cohere Rerank Multilingual v3.0 - Semantic reranking model supporting 100+ languages for global RAG deployments.',
        @RerankerTypeID,
        80,
        1
    );

    -- Add model-vendor association for rerank-multilingual-v3.0
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, Priority, DriverClass, APIName, Status, TypeID)
    VALUES (
        'A7F3B2C1-8D4E-4F5A-9C6B-1E2F3A4B5C6D',
        @CohereRerankMultilingualID,
        @CohereVendorID,
        1,
        'CohereReranker',
        'rerank-multilingual-v3.0',
        'Active',
        @InferenceProviderTypeDefID
    );
END

-- ============================================================================
-- 5. Add LLM-based Reranker Model
-- ============================================================================
-- LLM reranker uses the AI Prompts system instead of a dedicated API
-- This allows reranking using any configured LLM when Cohere is not available

DECLARE @LLMRerankerID UNIQUEIDENTIFIER = '7D3E8F5A-C621-4B89-9E12-8A4C2F7D1B90';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE Name = 'LLM Reranker')
BEGIN
    -- LLM Reranker doesn't need a vendor - it uses the AI Prompts system
    -- The RerankerService handles this model specially by name
    INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
    VALUES (
        @LLMRerankerID,
        'LLM Reranker',
        'LLM-based semantic reranking using AI Prompts. Uses any configured language model to score document relevance. Useful when dedicated reranker APIs are not available.',
        @RerankerTypeID,
        50,
        1
    );
END

-- ============================================================================
-- 6. Add Extended Property for RerankerConfiguration Column
-- ============================================================================
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent')
    AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent') AND name = 'RerankerConfiguration')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'JSON configuration for optional reranking of retrieved memory items. Schema: { enabled: boolean, rerankerModelId: string, retrievalMultiplier: number (default 3), minRelevanceThreshold: number (default 0.5), rerankPromptId?: string, contextFields?: string[], fallbackOnError: boolean (default true) }. When null or disabled, vector search results are used directly without reranking.',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'AIAgent',
        @level2type = N'COLUMN', @level2name = 'RerankerConfiguration';
END
