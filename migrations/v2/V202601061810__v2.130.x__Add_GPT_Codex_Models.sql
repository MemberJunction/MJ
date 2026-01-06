-- Add GPT Codex models (5.2-codex, 5.1-codex-max, 5.1-codex-mini)
-- This migration adds:
-- 1. Three GPT Codex AI Models optimized for agentic coding
-- 2. AIModelVendor associations for OpenAI as the model developer
-- 3. AIModelVendor associations for OpenAI as the inference provider
-- 4. Cost tracking records for OpenAI pricing

-- Use existing OpenAI Vendor ID
DECLARE @VendorID UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- OpenAI Vendor ID (existing)

-- Model IDs for the three new models
DECLARE @Model52CodexID UNIQUEIDENTIFIER = '0D67A020-6FE0-465F-9213-6B1D74ED7989';
DECLARE @Model51CodexMaxID UNIQUEIDENTIFIER = '9C755A76-4BA7-4161-9041-B4E05302D6D0';
DECLARE @Model51CodexMiniID UNIQUEIDENTIFIER = '6430D534-5301-48F9-9E70-DA6D81686773';

-- Type IDs (standard from MemberJunction)
DECLARE @LLMTypeID UNIQUEIDENTIFIER = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- ========================================
-- 1. GPT 5.2-codex
-- ========================================

-- Create GPT 5.2-codex model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Model52CodexID,
        'GPT 5.2-codex',
        'OpenAI''s most advanced agentic coding model for complex, real-world software engineering. Features 400,000 token context window with 128,000 output capacity. Optimized for long-horizon work through context compaction, stronger performance on large code changes like refactors and migrations, improved Windows environment support, and significantly enhanced cybersecurity capabilities with knowledge cutoff of October 2024.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        11, -- PowerRank (most advanced coding model)
        8, -- SpeedRank (medium-high speed)
        9  -- CostRank (premium pricing)
    );

-- Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'CC561D6E-6E28-46B5-98E1-DF656CE3DE64',
        @Model52CodexID,
        @VendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        1, -- SupportsEffortLevel (GPT 5.x series supports reasoning)
        0  -- SupportsStreaming (0 for developer role)
    );

-- Create AI Model Vendor association for OpenAI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'CFBA3339-A9B7-47AC-ADC7-1049F7D45F53',
        @Model52CodexID,
        @VendorID,
        @InferenceProviderTypeID,
        'gpt-5.2-codex', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM', -- Driver class
        NULL, -- DriverImportPath
        272000, -- MaxInputTokens (400k context - 128k max output)
        128000  -- MaxOutputTokens
    );

-- Add cost tracking record
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'E7FA5A72-959E-4947-B20F-1D64B4019F67',
        @Model52CodexID,
        @VendorID,
        '2025-12-01', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.75, -- Input price per M tokens
        14.00, -- Output price per M tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT 5.2-codex pricing on OpenAI as of December 2025. Released December 2025 in all Codex surfaces for paid ChatGPT users with API access planned. Features 400,000 token context window (actual max input 272k tokens with 128k reserved for output) and knowledge cutoff of October 2024. Version of GPT 5.2 further optimized for agentic coding with improvements to long-horizon work through context compaction, stronger performance on large code changes like refactors and migrations, improved performance in Windows environments, and significantly stronger cybersecurity capabilities. Represents 40% price increase over GPT 5 ($1.25/$10 per 1M tokens).'
    );

-- ========================================
-- 2. GPT 5.1-codex-max
-- ========================================

-- Create GPT 5.1-codex-max model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Model51CodexMaxID,
        'GPT 5.1-codex-max',
        'OpenAI''s frontier agentic coding model built on an update to the foundational reasoning model. Trained to operate across multiple context windows through compaction, coherently working over millions of tokens in a single task. Matches GPT 5.1-Codex performance on SWE-Bench Verified with ~30% fewer thinking tokens. Achieves 77.9% on SWE-Bench Verified, 79.9% on SWE-Lancer IC SWE, and 58.1% on TerminalBench 2.0. Capable of working on tasks for more than 24 hours in internal testing with knowledge cutoff of October 2024.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        10, -- PowerRank (frontier agentic coding capabilities)
        7, -- SpeedRank (slower due to reasoning overhead)
        5  -- CostRank (mid-tier pricing)
    );

-- Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        'A9E5C883-9EB4-4522-8A7E-2289E9B67548',
        @Model51CodexMaxID,
        @VendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        1, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- Create AI Model Vendor association for OpenAI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        'E18BA441-E941-4390-B68F-137C71A80EF5',
        @Model51CodexMaxID,
        @VendorID,
        @InferenceProviderTypeID,
        'gpt-5.1-codex-max', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM', -- Driver class
        NULL, -- DriverImportPath
        272000, -- MaxInputTokens
        128000  -- MaxOutputTokens
    );

-- Add cost tracking record
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        '0A653508-E183-406B-8996-CFC0D3F8259B',
        @Model51CodexMaxID,
        @VendorID,
        '2025-11-19', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        1.25, -- Input price per M tokens
        10.00, -- Output price per M tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT 5.1-codex-max pricing on OpenAI as of November 2025. Released November 19, 2025 as OpenAI''s new frontier agentic coding model available in Codex with ChatGPT Plus, Pro, Business, Edu, and Enterprise plans. API name is gpt-5.1-codex-max. Purpose-built for long-running agentic coding tasks and only available in the Responses API. Features native training to operate across multiple context windows through compaction technique, allowing coherent work over millions of tokens in a single task. Capable of working on tasks for more than 24 hours in internal testing. Achieves 77.9% on SWE-Bench Verified, 79.9% on SWE-Lancer IC SWE, and 58.1% on TerminalBench 2.0. Matches GPT 5.1-Codex performance with ~30% fewer thinking tokens. Same pricing as GPT 5 ($1.25/$10 per 1M tokens). Knowledge cutoff of October 2024.'
    );

-- ========================================
-- 3. GPT 5.1-codex-mini
-- ========================================

-- Create GPT 5.1-codex-mini model record
INSERT INTO [${flyway:defaultSchema}].[AIModel]
    (ID, Name, Description, AIModelTypeID, IsActive, PowerRank, SpeedRank, CostRank)
VALUES
    (
        @Model51CodexMiniID,
        'GPT 5.1-codex-mini',
        'OpenAI''s smaller, more cost-effective coding model optimized for efficient agentic coding tasks. Features 400,000 token context window with fast response times and significantly lower costs. Designed for local tasks and provides up to 4x more usage compared to standard Codex models. Ideal for simpler coding tasks where speed and cost efficiency are priorities while maintaining solid coding capabilities with knowledge cutoff of October 2024.',
        @LLMTypeID, -- LLM type
        1, -- IsActive
        8, -- PowerRank (efficient but less capable)
        10, -- SpeedRank (fastest response times)
        8  -- CostRank (cost-effective)
    );

-- Create AI Model Vendor association for OpenAI as model developer
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming)
VALUES
    (
        '5FD7A190-DBA0-4B38-87A2-183F52524581',
        @Model51CodexMiniID,
        @VendorID,
        @ModelDeveloperTypeID,
        0, -- Priority
        'Active',
        'Any',
        1, -- SupportsEffortLevel
        0  -- SupportsStreaming (0 for developer role)
    );

-- Create AI Model Vendor association for OpenAI as inference provider
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, DriverImportPath, MaxInputTokens, MaxOutputTokens)
VALUES
    (
        '5DFECCBC-A74D-493A-BFC4-6BC6DE896D11',
        @Model51CodexMiniID,
        @VendorID,
        @InferenceProviderTypeID,
        'gpt-5.1-codex-mini', -- API name
        1, -- Priority
        'Active',
        'Any, JSON',
        1, -- SupportsEffortLevel
        1, -- SupportsStreaming
        'OpenAILLM', -- Driver class
        NULL, -- DriverImportPath
        400000, -- MaxInputTokens (400k context window)
        128000  -- MaxOutputTokens
    );

-- Add cost tracking record
INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
    (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES
    (
        'B65E00CB-7E35-46D0-90DB-89C09FFBD437',
        @Model51CodexMiniID,
        @VendorID,
        '2025-11-13', -- Model release date
        NULL,
        'Active',
        'USD',
        'ece2bcb7-c854-4bf7-a517-d72793a40652', -- Standard token pricing type
        0.25, -- Input price per M tokens
        2.00, -- Output price per M tokens
        '54208f7d-331c-40ab-84e8-163338ee9ea1', -- Per 1M tokens unit type
        'Realtime',
        'GPT 5.1-codex-mini pricing on OpenAI as of November 2025. Released November 13, 2025 as a more efficient option for simpler coding tasks. API name is gpt-5.1-codex-mini. Features 400,000 token context window and provides up to 4x more usage compared to standard Codex models. Designed for local tasks where cost efficiency and speed are priorities. Part of OpenAI''s Codex family optimized for agentic coding applications and integrates into developer environments including CLI, IDE extensions, and GitHub. Pricing matches GPT 5-mini at $0.25/$2.00 per 1M tokens. Knowledge cutoff of October 2024.'
    );
