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

-- 5. Add AIModelCost for Kimi K2 on Groq
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'A261A9EC-A7E1-412B-86E2-BEEAD4B4F999',
        @KimiModelID,
        'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- Groq vendor ID
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Same PriceTypeID as GPT-4o
        1.00, -- $1.00 per million input tokens
        3.00, -- $3.00 per million output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Same UnitTypeID as GPT-4o
        'Realtime',
        'Kimi K2 pricing on Groq as of July 2025'
    );

-- Log the operation
PRINT 'Successfully added Moonshot AI vendor and Kimi K2 model with vendor associations';
PRINT 'Moonshot AI Vendor ID: ' + CAST(@MoonshotVendorID AS NVARCHAR(50));
PRINT 'Kimi K2 Model ID: ' + CAST(@KimiModelID AS NVARCHAR(50));

-- 6. Add GPT 4.1 nano model
DECLARE @GPT41NanoModelID UNIQUEIDENTIFIER = '1BEC0566-9D7B-4A83-9701-DF5602A607EF';
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GPT41NanoModelID,
        'GPT 4.1 Nano',
        'GPT 4.1 Nano is a highly efficient and cost-effective small language model optimized for lightweight tasks while maintaining quality performance.',
        'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- LLM type
        1, -- IsActive
        4, -- PowerRank (lower performance tier)
        10, -- SpeedRank (very fast)
        10  -- CostRank (very cost effective)
    );

-- 7. Create AI Model Vendor associations for GPT 4.1 nano
-- First for OpenAI as the model developer (no API name needed)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        'A961C158-98FD-4963-A6B0-F4715C312738',
        @GPT41NanoModelID,
        'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- OpenAI vendor ID
        '10DB468E-F2CE-475D-9F39-2DF2DE75D257', -- Model Developer type
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- Second for OpenAI as the inference provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '9A2CBBF7-C708-406A-90A3-1948A05639F1',
        @GPT41NanoModelID,
        'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- OpenAI vendor ID
        '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', -- Inference Provider type
        'gpt-4.1-nano', -- API name
        0, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM',
        NULL,
        1047576, -- MaxInputTokens (1047k context window)
        32768   -- MaxOutputTokens (32k output limit)
    );

-- 8. Add AIModelCost for GPT 4.1 nano
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'F3A9A104-89AF-4703-90B9-191BBDA801F9',
        @GPT41NanoModelID,
        'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E', -- OpenAI vendor ID
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Same PriceTypeID as GPT-4o
        0.10, -- $0.10 per million input tokens
        0.40, -- $0.40 per million output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Same UnitTypeID as GPT-4o
        'Realtime',
        'GPT-4.1 Nano pricing as of July 2025'
    );

-- Log GPT 4.1 nano addition
PRINT 'Successfully added GPT-4.1 Nano model with vendor association and cost';
PRINT 'GPT-4.1 Nano Model ID: ' + CAST(@GPT41NanoModelID AS NVARCHAR(50));