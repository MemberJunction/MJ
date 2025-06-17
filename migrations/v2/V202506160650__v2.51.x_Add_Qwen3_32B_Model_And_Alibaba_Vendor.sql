-- Add Alibaba Cloud as an AI Vendor and Qwen 3 32B model
-- This migration adds:
-- 1. Alibaba Cloud as a new AI Vendor (model developer)
-- 2. Qwen 3 32B as a new AI Model
-- 3. AI Model Vendor associations for both Alibaba (developer) and Groq (inference provider)
-- 4. AI Vendor Type association for Alibaba as a Model Developer

-- 1. Create Alibaba Cloud vendor record
DECLARE @AlibabaVendorID UNIQUEIDENTIFIER = 'C2E2D782-1BDA-4F37-AF4B-953155FF6CF6';
INSERT INTO ${flyway:defaultSchema}.AIVendor 
    (ID, Name, Description)
VALUES 
    (
        @AlibabaVendorID,
        'Alibaba Cloud',
        'Cloud computing company and developer of the Qwen series of large language models, offering advanced AI capabilities across multiple languages and reasoning tasks.'
    );

-- 2. Create Qwen 3 32B model record
DECLARE @QwenModelID UNIQUEIDENTIFIER = 'C496B988-4EA4-4D7E-A6DD-255F56D93933';
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @QwenModelID,
        'Qwen 3 32B',
        'Advanced multilingual language model from the Qwen series supporting 100+ languages. Offers strong reasoning, instruction-following, and creative writing capabilities with efficient performance for general-purpose dialogue and complex logical tasks.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        11, -- PowerRank (strong capabilities but not the largest model)
        10, -- SpeedRank (relatively fast for its size)
        3  -- CostRank (mid-range cost)
    );

-- 3. Create AI Vendor Type association for Alibaba as Model Developer
INSERT INTO ${flyway:defaultSchema}.AIVendorType 
    (ID, VendorID, TypeID, Rank, Status)
VALUES 
    (
        'CF2A8DB8-1DB3-4C53-ACFE-8DDFB714E899',
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        10, -- Default rank
        'Active'
    );

-- 4. Create AI Model Vendor associations
-- First for Alibaba as the model developer (no API name needed)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '68EE9FF3-E9DB-4564-90D2-78C2D3AC956C',
        @QwenModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Second for Groq as the inference provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '9A558E9B-FDEA-4EA6-A0E8-8E94472DFECF',
        @QwenModelID,
        'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- Groq vendor ID
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen/qwen3-32b', -- Groq API name for this model
        0, -- Priority (Groq is the fastest/cost effeective)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming (Groq typically supports streaming)
        'GroqLLM', --  
        NULL, --  
        128000, -- MaxInputTokens (128k context window)
        16384  -- MaxOutputTokens (16k output limit)
    );

-- Log the operation
PRINT 'Successfully added Alibaba Cloud vendor and Qwen 3 32B model with vendor associations';
PRINT 'Alibaba Vendor ID: ' + CAST(@AlibabaVendorID AS NVARCHAR(50));
PRINT 'Qwen 3 32B Model ID: ' + CAST(@QwenModelID AS NVARCHAR(50));