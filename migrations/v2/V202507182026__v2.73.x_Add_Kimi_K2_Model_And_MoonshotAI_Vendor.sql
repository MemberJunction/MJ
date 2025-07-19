-- Add Moonshot AI as an AI Vendor and Kimi K2 model
-- This migration adds:
-- 1. Moonshot AI as a new AI Vendor (model developer)
-- 2. Kimi K2 as a new AI Model
-- 3. AI Model Vendor associations for both Moonshot AI (developer) and Groq (inference provider)
-- 4. AI Vendor Type association for Moonshot AI as a Model Developer

-- 1. Create Moonshot AI vendor record
DECLARE @MoonshotVendorID UNIQUEIDENTIFIER = 'F46A85CC-2897-4FB5-B557-99A95E93A42D';
INSERT INTO ${flyway:defaultSchema}.AIVendor 
    (ID, Name, Description)
VALUES 
    (
        @MoonshotVendorID,
        'Moonshot AI',
        'AI company that developed the Kimi series of large language models, including the advanced Kimi K2 instruction-following model with exceptional reasoning and code writing capabilities.'
    );

-- 2. Create Kimi K2 model record
DECLARE @KimiModelID UNIQUEIDENTIFIER = '71A6513F-1757-4FE5-9E78-0069198607C0';
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @KimiModelID,
        'Kimi K2',
        'Kimi K2 is an advanced instruction-following language model with exceptional code writing and reasoning capabilities.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        12, -- PowerRank (high-performance model)
        7, -- SpeedRank (fast inference on Groq)
        5  -- CostRank (mid-range cost)
    );

-- 3. Create AI Vendor Type association for Moonshot AI as Model Developer
INSERT INTO ${flyway:defaultSchema}.AIVendorType 
    (ID, VendorID, TypeID, Rank, Status)
VALUES 
    (
        '9ECBD91D-407F-4758-BDB2-1980DB1D1ADD',
        @MoonshotVendorID,
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        10, -- Default rank
        'Active'
    );

-- 4. Create AI Model Vendor associations
-- First for Moonshot AI as the model developer (no API name needed)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        '37C8550B-699F-48C9-A0CA-E599C165A637',
        @KimiModelID,
        @MoonshotVendorID,
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
        'DA60EB91-B2BC-4F24-BFEE-4DEAB8959ADF',
        @KimiModelID,
        'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- Groq vendor ID
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'moonshotai/kimi-k2-instruct', -- Groq API name for this model
        0, -- Priority (Groq is the fastest/cost effeective)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming (Groq typically supports streaming)
        'GroqLLM', --  
        NULL, --  
        131072, -- MaxInputTokens (131k context window)
        16384  -- MaxOutputTokens (16k output limit)
    );

-- Log the operation
PRINT 'Successfully added Moonshot AI vendor and Kimi K2 model with vendor associations';
PRINT 'Moonshot AI Vendor ID: ' + CAST(@MoonshotVendorID AS NVARCHAR(50));
PRINT 'Kimi K2 Model ID: ' + CAST(@KimiModelID AS NVARCHAR(50));