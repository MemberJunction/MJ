-- Add Qwen Coder 30B model with LMStudio as inference provider
-- This migration adds:
-- 1. Qwen Coder 30B as a new AI Model
-- 2. AIModelVendor association for Alibaba as the model developer
-- 3. AIModelVendor association for LMStudio as an inference provider

-- Declare IDs
DECLARE @QwenCoder30BModelID UNIQUEIDENTIFIER = '28E5835E-4464-495E-928B-4A6769C0EAA7';
DECLARE @AlibabaVendorID UNIQUEIDENTIFIER = 'C2E2D782-1BDA-4F37-AF4B-953155FF6CF6';
DECLARE @LMStudioVendorID UNIQUEIDENTIFIER = '2DA415EC-25AC-45D9-ABF0-3769F41D7BEF';

-- 1. Create Qwen Coder 30B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @QwenCoder30BModelID,
        'Qwen 3 Coder 30B',
        'Smaller code generation model from the Qwen 3 series, optimized for software development tasks including code generation, debugging, and technical documentation across multiple programming languages. Balanced size offering strong performance with efficient resource usage.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        10, -- PowerRank (strong coding capabilities)
        8, -- SpeedRank (faster than 480B model)
        7  -- CostRank (moderate cost)
    );

-- 2. Create AI Model Vendor association for Alibaba as the model developer (no API name needed)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        'EC5BAA95-F2DA-419E-8665-69F485FB5CFC',
        @QwenCoder30BModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 3. Create AI Model Vendor association for LMStudio as an inference provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        'B8F7C234-9E12-4F73-8D51-A23F5C8E9D45',
        @QwenCoder30BModelID,
        @LMStudioVendorID,
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen/qwen3-coder-30b', -- LMStudio's model name for this model
        0, -- Priority (LMStudio as primary provider)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel (LMStudio doesn't support effort levels)
        1, -- SupportsStreaming (LMStudio supports streaming)
        'LMStudioLLM',
        262144, -- MaxInputTokens (depends on local resources, using standard 32k)
        8192   -- MaxOutputTokens (more conservative for local inference)
    );

-- Log the operation
PRINT 'Successfully added Qwen Coder 30B model with Alibaba as developer and LMStudio as inference provider';
PRINT 'Qwen Coder 30B Model ID: ' + CAST(@QwenCoder30BModelID AS NVARCHAR(50));
PRINT 'Alibaba Developer Association ID: EC5BAA95-F2DA-419E-8665-69F485FB5CFC';
PRINT 'LMStudio Inference Association ID: B8F7C234-9E12-4F73-8D51-A23F5C8E9D45';