-- Add Qwen 3 models (4B, 1.7B, 8B, 14B) with LMStudio as inference provider
-- This migration adds:
-- 1. Four Qwen 3 models as new AI Models
-- 2. AIModelVendor associations for Alibaba as the model developer
-- 3. AIModelVendor associations for LMStudio as an inference provider

-- Declare Model IDs
DECLARE @Qwen3_4B_ModelID UNIQUEIDENTIFIER = '26EA1B87-ECAA-4BDF-83AD-4F8C1E33CC34';
DECLARE @Qwen3_1_7B_ModelID UNIQUEIDENTIFIER = '9526887D-228B-4817-97F4-3AA0C6FABA5D';
DECLARE @Qwen3_8B_ModelID UNIQUEIDENTIFIER = '0B32729C-6911-49ED-A8ED-B5DFE18DAB7F';
DECLARE @Qwen3_14B_ModelID UNIQUEIDENTIFIER = '7163007F-C555-4E02-BAD6-ADAC6D818F23';

-- Declare Vendor IDs (reusing existing from database)
DECLARE @AlibabaVendorID UNIQUEIDENTIFIER = 'C2E2D782-1BDA-4F37-AF4B-953155FF6CF6';
DECLARE @LMStudioVendorID UNIQUEIDENTIFIER = '2DA415EC-25AC-45D9-ABF0-3769F41D7BEF';

-- 1. Create Qwen 3 4B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Qwen3_4B_ModelID,
        'Qwen 3 4B',
        '4B version of Qwen 3 reasoning model from Alibaba Cloud. Offers good performance for common tasks while being resource-efficient, suitable for edge deployments and applications with limited computational resources.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        4, -- PowerRank (smaller model, less capable)
        10, -- SpeedRank (very fast due to small size)
        10  -- CostRank (very low cost)
    );

-- 2. Create Qwen 3 1.7B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Qwen3_1_7B_ModelID,
        'Qwen 3 1.7B',
        'Smallest version of Qwen 3 from Alibaba Cloud. Ultra-lightweight model optimized for extreme efficiency, ideal for mobile devices, edge computing, and applications requiring minimal resource usage while maintaining basic language understanding.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        2, -- PowerRank (smallest model, limited capabilities)
        10, -- SpeedRank (extremely fast)
        10  -- CostRank (minimal cost)
    );

-- 3. Create Qwen 3 8B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Qwen3_8B_ModelID,
        'Qwen 3 8B',
        '8B version of Qwen 3 from Alibaba Cloud. Balanced model offering solid performance across various tasks including reasoning, code generation, and conversation while maintaining reasonable resource requirements.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        6, -- PowerRank (moderate capabilities)
        9, -- SpeedRank (fast)
        9  -- CostRank (low cost)
    );

-- 4. Create Qwen 3 14B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Qwen3_14B_ModelID,
        'Qwen 3 14B',
        '14B version of Qwen 3 from Alibaba Cloud. Enhanced reasoning and generation capabilities with stronger performance on complex tasks, offering a good balance between capability and efficiency for professional applications.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        8, -- PowerRank (good capabilities)
        8, -- SpeedRank (reasonably fast)
        8  -- CostRank (moderate cost)
    );

-- Create AI Model Vendor associations for Alibaba as the model developer (no API name needed)

-- Qwen 3 4B - Alibaba Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        'CE97ADD1-F49D-4FF3-BE41-06EAC8711F8C',
        @Qwen3_4B_ModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Qwen 3 1.7B - Alibaba Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '61DCCBDB-7BB8-404B-BFAF-BC1E88655C01',
        @Qwen3_1_7B_ModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Qwen 3 8B - Alibaba Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        'B81A297F-1C4A-43E0-A6E6-13974C357E23',
        @Qwen3_8B_ModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Qwen 3 14B - Alibaba Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '8DEF630C-27EA-40AE-9386-AA1E7F7E2DF1',
        @Qwen3_14B_ModelID,
        @AlibabaVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Create AI Model Vendor associations for LMStudio as an inference provider

-- Qwen 3 4B - LMStudio Inference
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        'EC99CEA8-2E89-430F-B10D-3E02D27B4B0A',
        @Qwen3_4B_ModelID,
        @LMStudioVendorID,
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen/qwen3-4b', -- LMStudio's model name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'LMStudioLLM',
        131072, -- MaxInputTokens (128k context for smaller models)
        8192   -- MaxOutputTokens
    );

-- Qwen 3 1.7B - LMStudio Inference
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '44BB0BD7-5D80-4200-9540-7D82DF009FBB',
        @Qwen3_1_7B_ModelID,
        @LMStudioVendorID,
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen/qwen3-1.7b', -- LMStudio's model name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'LMStudioLLM',
        131072, -- MaxInputTokens
        8192   -- MaxOutputTokens
    );

-- Qwen 3 8B - LMStudio Inference
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '43E10F00-DAC0-4FEB-813C-9906F038966E',
        @Qwen3_8B_ModelID,
        @LMStudioVendorID,
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen/qwen3-8b', -- LMStudio's model name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'LMStudioLLM',
        131072, -- MaxInputTokens
        8192   -- MaxOutputTokens
    );

-- Qwen 3 14B - LMStudio Inference
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '99ED676C-5774-45FE-95A6-3AD130381502',
        @Qwen3_14B_ModelID,
        @LMStudioVendorID,
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'qwen/qwen3-14b', -- LMStudio's model name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'LMStudioLLM',
        131072, -- MaxInputTokens (128k context)
        8192   -- MaxOutputTokens
    );

-- Log the operation
PRINT 'Successfully added Qwen 3 models (4B, 1.7B, 8B, 14B) with Alibaba as developer and LMStudio as inference provider';
PRINT 'Qwen 3 4B Model ID: ' + CAST(@Qwen3_4B_ModelID AS NVARCHAR(50));
PRINT 'Qwen 3 1.7B Model ID: ' + CAST(@Qwen3_1_7B_ModelID AS NVARCHAR(50));
PRINT 'Qwen 3 8B Model ID: ' + CAST(@Qwen3_8B_ModelID AS NVARCHAR(50));
PRINT 'Qwen 3 14B Model ID: ' + CAST(@Qwen3_14B_ModelID AS NVARCHAR(50));