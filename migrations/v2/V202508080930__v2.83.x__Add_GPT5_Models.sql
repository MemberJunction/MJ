-- Add GPT-5 models and Claude Opus 4.1 with model developer and inference provider associations
-- This migration adds:
-- 1. Azure as a new AI Vendor (if not exists)
-- 2. Azure vendor types for inference provider
-- 3. Amazon Bedrock as a new AI Vendor (if not exists)
-- 4. Amazon Bedrock vendor types for inference provider
-- 5. GPT-5 as a new AI Model
-- 6. GPT-5 Mini as a new AI Model  
-- 7. GPT-5 Nano as a new AI Model
-- 8. Claude Opus 4.1 as a new AI Model
-- 9. AIModelVendor associations for OpenAI as the model developer for GPT-5 models
-- 10. AIModelVendor associations for Anthropic as the model developer and inference provider for Opus 4.1
-- 11. AIModelVendor associations for Amazon Bedrock as inference provider for Opus 4.1
-- 12. AIModelVendor associations for OpenAI and Azure as inference providers for GPT-5 models
-- 13. Cost tracking records for OpenAI, Azure, Anthropic, and Amazon Bedrock pricing

-- Variable placeholders for vendor IDs 
DECLARE @OpenAIVendorID UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- OpenAI Vendor ID 
DECLARE @AzureVendorID UNIQUEIDENTIFIER = 'D75ABC84-6BDB-41B9-94C7-2FE748482193'; -- Azure Vendor ID
DECLARE @AnthropicVendorID UNIQUEIDENTIFIER = 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Anthropic Vendor ID
DECLARE @BedrockVendorID UNIQUEIDENTIFIER = '59FA8F6E-F14C-4874-A69C-BAD794DDC3AA'; -- Amazon Bedrock Vendor ID

-- Model IDs for the new models
DECLARE @GPT5ModelID UNIQUEIDENTIFIER = '87C351DF-5039-4E1D-A2E9-CF5B91927E5E';
DECLARE @GPT5MiniModelID UNIQUEIDENTIFIER = '028491AF-48A3-4235-93A7-44A4E91F14C0';
DECLARE @GPT5NanoModelID UNIQUEIDENTIFIER = '0221217D-2037-48F8-AED0-286F53A165DF';
DECLARE @Opus41ModelID UNIQUEIDENTIFIER = '2C5EA224-85A1-4D09-ABA6-0D52F2E6AFBB';

-- Type IDs
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create Azure vendor record (if not exists)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendor WHERE ID = @AzureVendorID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIVendor 
        (ID, Name, Description)
    VALUES 
        (
            @AzureVendorID,
            'Azure',
            'Microsoft Azure cloud platform providing AI inference services for OpenAI models'
        );
END

-- 2. Create Azure vendor type for inference provider
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendorType WHERE VendorID = @AzureVendorID AND TypeID = @InferenceProviderTypeID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIVendorType 
        (ID, VendorID, TypeID, Rank, Status)
    VALUES 
        (
            'B0A79AC2-74F7-4FDE-AAE0-B201550D5CDB',
            @AzureVendorID,
            @InferenceProviderTypeID,
            5, -- Rank
            'Active'
        );
END

-- 3. Create Amazon Bedrock vendor record (if not exists)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendor WHERE ID = @BedrockVendorID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIVendor 
        (ID, Name, Description)
    VALUES 
        (
            @BedrockVendorID,
            'Amazon Bedrock',
            'AWS fully managed service providing access to foundation models from leading AI companies including Anthropic Claude models'
        );
END

-- 4. Create Amazon Bedrock vendor type for inference provider
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendorType WHERE VendorID = @BedrockVendorID AND TypeID = @InferenceProviderTypeID)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIVendorType 
        (ID, VendorID, TypeID, Rank, Status)
    VALUES 
        (
            'F183DF98-ABAA-4414-AEE0-EAF12760675C',
            @BedrockVendorID,
            @InferenceProviderTypeID,
            5, -- Rank
            'Active'
        );
END

-- 5. Create GPT-5 model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GPT5ModelID,
        'GPT-5',
        'OpenAI''s flagship model combining reasoning abilities with fast responses. Smartest, fastest, most useful model with 272k input and 128k output token limits. 45% less likely to hallucinate than GPT-4o.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        20, -- PowerRank (highest power)
        9, -- SpeedRank (fast)
        5  -- CostRank (moderate - $1.25/$10 per M tokens)
    );

-- 6. Create GPT-5 Mini model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GPT5MiniModelID,
        'GPT-5 Mini',
        'Smaller, cost-efficient version of GPT-5 with excellent performance for most tasks. Supports 272k input and 128k output tokens with fast response times.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        15, -- PowerRank (powerful)
        10, -- SpeedRank (fastest)
        8  -- CostRank (low cost - $0.25/$2 per M tokens)
    );

-- 7. Create GPT-5 Nano model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @GPT5NanoModelID,
        'GPT-5 Nano',
        'Ultra-efficient smallest version of GPT-5 optimized for high-volume, low-latency applications. Supports 272k input and 128k output tokens.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        12, -- PowerRank (good for its size)
        10, -- SpeedRank (ultra fast)
        10  -- CostRank (cheapest - $0.05/$0.40 per M tokens)
    );

-- 8. Create Claude Opus 4.1 model record
INSERT INTO ${flyway:defaultSchema}.AIModel 
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES 
    (
        @Opus41ModelID,
        'Claude Opus 4.1',
        'Anthropic''s most advanced model with 74.5% on SWE-bench Verified. Released August 5, 2025, with improved agentic tasks, real-world coding, and reasoning capabilities. Supports 200k token context window.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        19, -- PowerRank (very powerful, comparable to GPT-5)
        7, -- SpeedRank (good speed)
        3  -- CostRank (expensive - $15/$75 per M tokens)
    );

-- 9. Create AI Model Vendor associations for OpenAI as model developer (all 3 GPT-5 models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    -- GPT-5 Model Developer
    (
        'B3D650CE-978D-4E03-8CCB-BA4ABBACB3A0',
        @GPT5ModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    -- GPT-5 Mini Model Developer
    (
        '3AD0029B-B02A-4D79-B3D9-2B69097AE3B9',
        @GPT5MiniModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    ),
    -- GPT-5 Nano Model Developer
    (
        'A39697E3-9AE3-457F-B921-7D173CC22310',
        @GPT5NanoModelID,
        @OpenAIVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 10. Create AI Model Vendor associations for Anthropic as model developer and inference provider for Opus 4.1
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES 
    -- Opus 4.1 Model Developer
    (
        'FDA4F858-F4B1-4256-A180-94C730F362CC',
        @Opus41ModelID,
        @AnthropicVendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        0, -- SupportsEffortLevel
        0  -- SupportsStreaming
    );

-- 11. Create AI Model Vendor association for Anthropic as inference provider for Opus 4.1
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    -- Opus 4.1 on Anthropic
    (
        '61369B16-0F95-4F4B-87EF-F64FD2F728E1',
        @Opus41ModelID,
        @AnthropicVendorID,
        @InferenceProviderTypeID,
        'claude-opus-4-1-20250805', -- Anthropic API name
        0, -- Priority (highest)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'AnthropicLLM',
        200000, -- MaxInputTokens (200k context window)
        4096  -- MaxOutputTokens (4k output limit)
    );

-- 12. Create AI Model Vendor association for Amazon Bedrock as inference provider for Opus 4.1
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    -- Opus 4.1 on Amazon Bedrock
    (
        '3363B831-66DC-4E62-8AAC-9F2A2B12D59E',
        @Opus41ModelID,
        @BedrockVendorID,
        @InferenceProviderTypeID,
        'anthropic.claude-3-opus-20240229', -- Bedrock model ID for Claude models
        5, -- Priority (lower than direct Anthropic)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'BedrockLLM',
        200000, -- MaxInputTokens (200k context window)
        4096  -- MaxOutputTokens (4k output limit)
    );

-- 13. Create AI Model Vendor associations for OpenAI as inference provider (all 3 GPT-5 models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    -- GPT-5 on OpenAI
    (
        'FC307EF5-EA02-4EBF-8553-8A81A436702B',
        @GPT5ModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-5', -- OpenAI API name
        0, -- Priority (highest - OpenAI preferred over Azure)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM',
        272000, -- MaxInputTokens (272k context window)
        128000  -- MaxOutputTokens (128k output limit)
    ),
    -- GPT-5 Mini on OpenAI
    (
        '945C1236-B7C2-4F6B-A535-0915BF861CC0',
        @GPT5MiniModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-5-mini', -- OpenAI API name
        0, -- Priority (highest - OpenAI preferred over Azure)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    ),
    -- GPT-5 Nano on OpenAI
    (
        '6F6210A5-72F2-4D76-AD19-B2E49A9E2FA8',
        @GPT5NanoModelID,
        @OpenAIVendorID,
        @InferenceProviderTypeID,
        'gpt-5-nano', -- OpenAI API name
        0, -- Priority (highest - OpenAI preferred over Azure)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM',
        512000, -- MaxInputTokens (512k context window)
        128000  -- MaxOutputTokens (128k output limit)
    );

-- 14. Create AI Model Vendor associations for Azure as inference provider (all 3 GPT-5 models)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    -- GPT-5 on Azure
    (
        'C00086B7-E296-40BE-95D4-1FDEDFAAC79D',
        @GPT5ModelID,
        @AzureVendorID,
        @InferenceProviderTypeID,
        'gpt-5', -- Azure API name (same as OpenAI)
        10, -- Priority (lower than OpenAI)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'AzureOpenAILLM',
        272000, -- MaxInputTokens (272k context window)
        128000  -- MaxOutputTokens (128k output limit)
    ),
    -- GPT-5 Mini on Azure
    (
        'B964EDCF-625C-4D0B-B0FC-C1D5E8CF24B1',
        @GPT5MiniModelID,
        @AzureVendorID,
        @InferenceProviderTypeID,
        'gpt-5-mini', -- Azure API name (same as OpenAI)
        10, -- Priority (lower than OpenAI)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'AzureOpenAILLM',
        128000, -- MaxInputTokens (128k context window)
        32000  -- MaxOutputTokens (32k output limit)
    ),
    -- GPT-5 Nano on Azure
    (
        '3E7D9C36-3C18-42F5-AE09-562E2C2436BC',
        @GPT5NanoModelID,
        @AzureVendorID,
        @InferenceProviderTypeID,
        'gpt-5-nano', -- Azure API name (same as OpenAI)
        10, -- Priority (lower than OpenAI)
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'AzureOpenAILLM',
        272000, -- MaxInputTokens (272k context window)
        128000  -- MaxOutputTokens (128k output limit)
    );

-- 15. Add cost tracking records for OpenAI pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    -- GPT-5 on OpenAI
    (
        '5F8BC862-CFAF-4DD9-BEB0-C723C8447597',
        @GPT5ModelID,
        @OpenAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.25, -- $1.25 per M input tokens
        10.00, -- $10.00 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5 pricing on OpenAI as of August 2025'
    ),
    -- GPT-5 Mini on OpenAI
    (
        '4D4CB947-AA09-48E6-9FF3-43C6AA75D58E',
        @GPT5MiniModelID,
        @OpenAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.25, -- $0.25 per M input tokens
        2.00, -- $2.00 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5 Mini pricing on OpenAI as of August 2025'
    ),
    -- GPT-5 Nano on OpenAI
    (
        '060C9269-CCA4-41A0-99DC-55A95D17A3E0',
        @GPT5NanoModelID,
        @OpenAIVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.05, -- $0.05 per M input tokens
        0.40, -- $0.40 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5 Nano pricing on OpenAI as of August 2025'
    );

-- 16. Add cost tracking record for Anthropic Opus 4.1 pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    -- Opus 4.1 on Anthropic
    (
        '28C400E6-4DAC-4DE2-915C-8525D77FE92C',
        @Opus41ModelID,
        @AnthropicVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        15.00, -- $15.00 per M input tokens
        75.00, -- $75.00 per M output tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Claude Opus 4.1 pricing on Anthropic as of August 2025'
    );

-- 17. Add cost tracking record for Amazon Bedrock Opus 4.1 pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    -- Opus 4.1 on Amazon Bedrock
    (
        '64186C02-8782-41C1-B347-415D149133FC',
        @Opus41ModelID,
        @BedrockVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        15.00, -- $15.00 per M input tokens (same as Anthropic)
        75.00, -- $75.00 per M output tokens (same as Anthropic)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'Claude Opus 4.1 pricing on Amazon Bedrock as of August 2025'
    );

-- 18. Add cost tracking records for Azure pricing
INSERT INTO ${flyway:defaultSchema}.AIModelCost 
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES 
    -- GPT-5 on Azure
    (
        '32256481-17B2-4D99-BA39-99C969462459',
        @GPT5ModelID,
        @AzureVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.25, -- $1.25 per M input tokens (same as OpenAI)
        10.00, -- $10.00 per M output tokens (same as OpenAI)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5 pricing on Azure as of August 2025'
    ),
    -- GPT-5 Mini on Azure
    (
        '866EF5E1-67BF-4090-840F-0C51C88228BA',
        @GPT5MiniModelID,
        @AzureVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.25, -- $0.25 per M input tokens (same as OpenAI)
        2.00, -- $2.00 per M output tokens (same as OpenAI)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5 Mini pricing on Azure as of August 2025'
    ),
    -- GPT-5 Nano on Azure
    (
        '1A383960-A7D7-457F-81CC-A40DB36F0098',
        @GPT5NanoModelID,
        @AzureVendorID,
        GETDATE(),
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.05, -- $0.05 per M input tokens (same as OpenAI)
        0.40, -- $0.40 per M output tokens (same as OpenAI)
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT-5 Nano pricing on Azure as of August 2025'
    );

-- Log the operation
PRINT 'Successfully added GPT-5 models and Claude Opus 4.1:';
PRINT 'GPT-5 Model ID: ' + CAST(@GPT5ModelID AS NVARCHAR(50));
PRINT 'GPT-5 Mini Model ID: ' + CAST(@GPT5MiniModelID AS NVARCHAR(50));
PRINT 'GPT-5 Nano Model ID: ' + CAST(@GPT5NanoModelID AS NVARCHAR(50));
PRINT 'Claude Opus 4.1 Model ID: ' + CAST(@Opus41ModelID AS NVARCHAR(50));
PRINT '';
PRINT 'Azure Vendor ID: ' + CAST(@AzureVendorID AS NVARCHAR(50));
PRINT 'Amazon Bedrock Vendor ID: ' + CAST(@BedrockVendorID AS NVARCHAR(50));
PRINT '';
PRINT 'Model Developer Associations:';
PRINT 'OpenAI Developer (GPT-5): B3D650CE-978D-4E03-8CCB-BA4ABBACB3A0';
PRINT 'OpenAI Developer (GPT-5 Mini): 3AD0029B-B02A-4D79-B3D9-2B69097AE3B9';
PRINT 'OpenAI Developer (GPT-5 Nano): A39697E3-9AE3-457F-B921-7D173CC22310';
PRINT 'Anthropic Developer (Opus 4.1): FDA4F858-F4B1-4256-A180-94C730F362CC';
PRINT '';
PRINT 'Inference Provider Associations:';
PRINT 'OpenAI Inference (GPT-5): FC307EF5-EA02-4EBF-8553-8A81A436702B';
PRINT 'OpenAI Inference (GPT-5 Mini): 945C1236-B7C2-4F6B-A535-0915BF861CC0';
PRINT 'OpenAI Inference (GPT-5 Nano): 6F6210A5-72F2-4D76-AD19-B2E49A9E2FA8';
PRINT 'Anthropic Inference (Opus 4.1): 61369B16-0F95-4F4B-87EF-F64FD2F728E1';
PRINT 'Amazon Bedrock Inference (Opus 4.1): 3363B831-66DC-4E62-8AAC-9F2A2B12D59E';
PRINT 'Azure Inference (GPT-5): C00086B7-E296-40BE-95D4-1FDEDFAAC79D';
PRINT 'Azure Inference (GPT-5 Mini): B964EDCF-625C-4D0B-B0FC-C1D5E8CF24B1';
PRINT 'Azure Inference (GPT-5 Nano): 3E7D9C36-3C18-42F5-AE09-562E2C2436BC';
PRINT '';
PRINT 'Cost Tracking Records:';
PRINT 'OpenAI Cost (GPT-5): 5F8BC862-CFAF-4DD9-BEB0-C723C8447597';
PRINT 'OpenAI Cost (GPT-5 Mini): 4D4CB947-AA09-48E6-9FF3-43C6AA75D58E';
PRINT 'OpenAI Cost (GPT-5 Nano): 060C9269-CCA4-41A0-99DC-55A95D17A3E0';
PRINT 'Anthropic Cost (Opus 4.1): 28C400E6-4DAC-4DE2-915C-8525D77FE92C';
PRINT 'Amazon Bedrock Cost (Opus 4.1): 64186C02-8782-41C1-B347-415D149133FC';
PRINT 'Azure Cost (GPT-5): 32256481-17B2-4D99-BA39-99C969462459';
PRINT 'Azure Cost (GPT-5 Mini): 866EF5E1-67BF-4090-840F-0C51C88228BA';
PRINT 'Azure Cost (GPT-5 Nano): 1A383960-A7D7-457F-81CC-A40DB36F0098';