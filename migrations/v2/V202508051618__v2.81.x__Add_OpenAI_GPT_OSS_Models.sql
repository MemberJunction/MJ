-- Add OpenAI GPT-OSS models (120B and 20B) with model developer and inference provider associations
-- This migration adds:
-- 1. GPT-OSS-120B as a new AI Model (117B total parameters, 5.1B active)
-- 2. GPT-OSS-20B as a new AI Model (21B total parameters, 3.6B active)
-- 3. AIModelVendor associations for OpenAI as the model developer for both models
-- 4. AIModelVendor associations for OpenAI, Groq, and Cerebras as inference providers
-- 5. Cost tracking records for Groq and Cerebras pricing

-- Variable placeholders for vendor IDs 
DECLARE @OpenAIVendorID UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- OpenAI Vendor ID 
DECLARE @GroqVendorID UNIQUEIDENTIFIER = 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Groq Vendor ID 
DECLARE @CerebrasVendorID UNIQUEIDENTIFIER = '3EDA433E-F36B-1410-8DB6-00021F8B792E'; -- Cerebras Vendor ID

-- Model IDs for the new models
DECLARE @GPTOss120BModelID UNIQUEIDENTIFIER = '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0';
DECLARE @GPTOss20BModelID UNIQUEIDENTIFIER = 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D';

-- Type IDs
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create GPT-OSS-120B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GPTOss120BModelID,
        'GPT-OSS-120B',
        'OpenAI''s open-weight language model with 117B total parameters (5.1B active). Features configurable reasoning levels, full chain-of-thought access, native function calling, web browsing, and Python code execution. Designed for production and general-purpose high-reasoning use cases with Apache 2.0 license.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        14, -- PowerRank (very powerful for reasoning tasks)
        5, -- SpeedRank (moderate speed due to reasoning capabilities)
        7  -- CostRank (moderate-high cost)
    );

-- 2. Create GPT-OSS-20B model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GPTOss20BModelID,
        'GPT-OSS-20B',
        'OpenAI''s open-weight language model with 21B total parameters (3.6B active). Features configurable reasoning levels, native tool use capabilities, fine-tuning support, and runs within 16GB memory. Optimized for local/specialized use cases with Apache 2.0 license.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        11, -- PowerRank (powerful but smaller than 120B)
        7, -- SpeedRank (faster than 120B due to smaller size)
        5  -- CostRank (lower cost than 120B)
    );

-- 3. Create AI Model Vendor associations for OpenAI as model developer (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    (
        'A0F93920-43BB-4F10-B1C9-AE662636839F',
        @GPTOss120BModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    (
        '9B251180-8A02-4925-9C70-FCE17B23D920',
        @GPTOss20BModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority (lower number = higher priority)
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 4. Create AI Model Vendor associations for OpenAI as inference provider (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '858475F5-DF0D-4248-B147-44EC2D4D1F7F',
        @GPTOss120BModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-oss-120b', -- OpenAI API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    ),
    (
        '4BEA9075-D9EF-4256-B81B-6B22E96D93CA',
        @GPTOss20BModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-oss-20b', -- OpenAI API name
        0, -- Priority
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    );

-- 5. Create AI Model Vendor associations for Groq as inference provider (both models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        'AA3E18FA-2379-49FA-86BB-B33F6F278487',
        @GPTOss120BModelID,
        @GroqVendorID,
        @InferenceProviderTypeID,
        'openai/gpt-oss-120b', -- Groq API name
        10, -- Priority (higher than OpenAI)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'GroqLLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    ),
    (
        'FEA7FCBF-3A69-4956-977F-4262DD41C580',
        @GPTOss20BModelID,
        @GroqVendorID,
        @InferenceProviderTypeID,
        'openai/gpt-oss-20b', -- Groq API name
        1, -- Priority (lower than OpenAI)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'GroqLLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    );

-- 6. Create AI Model Vendor association for Cerebras as inference provider (120B only)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '9CD45EE2-0D5D-448F-9D05-F971C471FB63',
        @GPTOss120BModelID,
        @CerebrasVendorID,
        @InferenceProviderTypeID,
        'gpt-oss-120b', -- Cerebras API name
        2, -- Priority (lower than OpenAI and Groq)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'CerebrasLLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    );

-- 7. Add cost tracking records for Groq pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        '37F35DF1-C29A-4ECA-BE52-0A8691842527',
        @GPTOss120BModelID,
        @GroqVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.15, -- $0.15 per M input tokens
        0.75, -- $0.75 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-OSS-120B pricing on Groq as of August 2025'
    ),
    (
        '42B213D6-BC91-4B4B-88D7-2C7ADCF0D789',
        @GPTOss20BModelID,
        @GroqVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.10, -- $0.10 per M input tokens
        0.50, -- $0.50 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-OSS-20B pricing on Groq as of August 2025'
    );

-- 8. Add cost tracking records for Cerebras pricing (120B only)
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    (
        'E6FD1FF0-B83B-4A6A-A5A0-944F73209188',
        @GPTOss120BModelID,
        @CerebrasVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.25, -- $0.25 per M input tokens
        0.69, -- $0.69 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-OSS-120B pricing on Cerebras as of August 2025'
    );

-- Log the operation
PRINT 'Successfully added OpenAI GPT-OSS models:';
PRINT 'GPT-OSS-120B Model ID: ' + CAST(@GPTOss120BModelID AS NVARCHAR(50));
PRINT 'GPT-OSS-20B Model ID: ' + CAST(@GPTOss20BModelID AS NVARCHAR(50));
PRINT '';
PRINT 'Model Developer Associations:';
PRINT 'OpenAI Developer (120B): A0F93920-43BB-4F10-B1C9-AE662636839F';
PRINT 'OpenAI Developer (20B): 9B251180-8A02-4925-9C70-FCE17B23D920';
PRINT '';
PRINT 'Inference Provider Associations:';
PRINT 'OpenAI Inference (120B): 858475F5-DF0D-4248-B147-44EC2D4D1F7F';
PRINT 'OpenAI Inference (20B): 4BEA9075-D9EF-4256-B81B-6B22E96D93CA';
PRINT 'Groq Inference (120B): AA3E18FA-2379-49FA-86BB-B33F6F278487';
PRINT 'Groq Inference (20B): FEA7FCBF-3A69-4956-977F-4262DD41C580';
PRINT 'Cerebras Inference (120B): 9CD45EE2-0D5D-448F-9D05-F971C471FB63';
PRINT '';
PRINT 'Cost Tracking Records:';
PRINT 'Groq Cost (120B): 37F35DF1-C29A-4ECA-BE52-0A8691842527';
PRINT 'Groq Cost (20B): 42B213D6-BC91-4B4B-88D7-2C7ADCF0D789';
PRINT 'Cerebras Cost (120B): E6FD1FF0-B83B-4A6A-A5A0-944F73209188'; 