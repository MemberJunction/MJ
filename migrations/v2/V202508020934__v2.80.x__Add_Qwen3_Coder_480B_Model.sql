-- Fix existing Cerebras ModelVendor Record
UPDATE ${flyway:defaultSchema}.AIModelVendor SET APIName='qwen-3-235b-a22b-thinking-2507' WHERE ID='4CB2443E-F36B-1410-8DB7-00021F8B792E'


-- Add Qwen 3 Coder 480B model with Alibaba as model developer and Cerebras as inference provider
-- This migration adds:
-- 1. Qwen 3 Coder 480B as a new AI Model
-- 2. AIModelVendor association for Alibaba as the model developer
-- 3. AIModelVendor association for Cerebras as the inference provider

-- 1. Create Qwen 3 Coder 480B model record
DECLARE @QwenCoder480BModelID UNIQUEIDENTIFIER = '711EDB52-2013-46E9-9A1F-59F439BC9E22';
DECLARE @AlibabaVendorID UNIQUEIDENTIFIER = 'C2E2D782-1BDA-4F37-AF4B-953155FF6CF6';
DECLARE @CerebrasVendorID UNIQUEIDENTIFIER = '3EDA433E-F36B-1410-8DB6-00021F8B792E';

INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @QwenCoder480BModelID,
        'Qwen 3 Coder 480B',
        'Large code generation model from the Qwen series, optimized for software development tasks including code generation, debugging, and technical documentation across 100+ programming languages.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        13, -- PowerRank (extremely powerful for coding tasks)
        6, -- SpeedRank (slower due to massive size)
        5  -- CostRank (high cost due to model size)
    );

-- 2. Create AI Model Vendor association for Alibaba as the model developer (no API name needed)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '6C73F1A0-66D4-4242-B026-44B306550F66',
        @QwenCoder480BModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 3. Create AI Model Vendor association for Cerebras as the inference provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '6AECC6CF-0287-4DC6-B6B1-C99074071CEB',
        @QwenCoder480BModelID,
        @CerebrasVendorID,
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen-3-coder-480b', -- Cerebras API name for this model
        0, -- Priority (Cerebras is currently the only inference provider)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming (Cerebras typically supports streaming)
        'CerebrasLLM',
        128000, -- MaxInputTokens (128k context window, typical for large models on Cerebras)
        16384  -- MaxOutputTokens (16k output limit, typical for Cerebras)
    );

-- Log the operation
PRINT 'Successfully added Qwen 3 Coder 480B model with Alibaba as developer and Cerebras as inference provider';
PRINT 'Qwen 3 Coder 480B Model ID: ' + CAST(@QwenCoder480BModelID AS NVARCHAR(50));
PRINT 'Alibaba Developer Association ID: 6C73F1A0-66D4-4242-B026-44B306550F66';
PRINT 'Cerebras Inference Association ID: 6AECC6CF-0287-4DC6-B6B1-C99074071CEB';