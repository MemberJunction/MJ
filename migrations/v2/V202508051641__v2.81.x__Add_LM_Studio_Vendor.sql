-- Add LM Studio as an AI Vendor for local inference
-- This migration adds:
-- 1. LM Studio as a new AI Vendor (local inference software)
-- 2. AIVendorType association marking LM Studio as an inference provider
-- 3. AIModelVendor associations for both GPT-OSS models with LM Studio
-- 4. Configures LM Studio with LMStudioLLM driver class for local API support

-- LM Studio Vendor ID
DECLARE @LMStudioVendorID UNIQUEIDENTIFIER = '2DA415EC-25AC-45D9-ABF0-3769F41D7BEF';

-- Model IDs from previous migration
DECLARE @GPTOss120BModelID UNIQUEIDENTIFIER = '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0';
DECLARE @GPTOss20BModelID UNIQUEIDENTIFIER = 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D';

-- Type IDs
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- 1. Create LM Studio vendor record
INSERT INTO ${flyway:defaultSchema}.AIVendor 
    (ID, Name, Description)
VALUES 
    (
        @LMStudioVendorID,
        'LM Studio',
        'Local AI inference software for macOS that provides an OpenAI-compatible API for running open-source language models locally. Enables private, offline AI inference without cloud dependencies.'
    );

-- 2. Create AI Vendor Type association for LM Studio as inference provider
INSERT INTO ${flyway:defaultSchema}.AIVendorType 
    (ID, VendorID, TypeID, Rank, Status)
VALUES 
    (
        '3FA504C9-D256-4910-BEC9-8D0BDA63DF99',
        @LMStudioVendorID,
        @InferenceProviderTypeID,
        0, -- Rank (higher number = higher priority for local inference)
        'Active'
    );

-- 3. Create AI Model Vendor associations for LM Studio with both GPT-OSS models
INSERT INTO ${flyway:defaultSchema}.AIModelVendor 
    (ID, ModelID, VendorID, TypeID, APIName, Priority, Status, SupportedResponseFormats, SupportsEffortLevel, SupportsStreaming, DriverClass, MaxInputTokens, MaxOutputTokens)
VALUES 
    (
        '2D4D724D-8EDE-4C08-9B18-EFA9FE958E67',
        @GPTOss120BModelID,
        @LMStudioVendorID,
        @InferenceProviderTypeID,
        'gpt-oss-120b', -- LM Studio API name (user configurable)
        1, -- Priority (lower priority than cloud providers for general use)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel (local models typically don't support effort levels)
        1, -- SupportsStreaming (LM Studio supports streaming)
        'LMStudioLLM',
        128000, -- MaxInputTokens (depends on available local hardware)
        32000  -- MaxOutputTokens (depends on available local hardware)
    ),
    (
        '2082A24D-E3C0-40AD-A0C1-ADEF0BAAE3A5',
        @GPTOss20BModelID,
        @LMStudioVendorID,
        @InferenceProviderTypeID,
        'gpt-oss-20b', -- LM Studio API name (user configurable)
        1, -- Priority (lower priority than cloud providers for general use)
        'Active',
        'Any, JSON',
        0, -- SupportsEffortLevel (local models typically don't support effort levels)
        1, -- SupportsStreaming (LM Studio supports streaming)
        'LMStudioLLM',
        128000, -- MaxInputTokens (depends on available local hardware)
        32000  -- MaxOutputTokens (depends on available local hardware)
    );

-- Log the operation
PRINT 'Successfully added LM Studio as AI Vendor:';
PRINT 'LM Studio Vendor ID: ' + CAST(@LMStudioVendorID AS NVARCHAR(50));
PRINT '';
PRINT 'Vendor Type Association:';
PRINT 'LM Studio Inference Provider: 3FA504C9-D256-4910-BEC9-8D0BDA63DF99';
PRINT '';
PRINT 'Model Vendor Associations:';
PRINT 'LM Studio + GPT-OSS-120B: 2D4D724D-8EDE-4C08-9B18-EFA9FE958E67';
PRINT 'LM Studio + GPT-OSS-20B: 2082A24D-E3C0-40AD-A0C1-ADEF0BAAE3A5';
PRINT '';
PRINT 'LM Studio is now configured for local inference of both GPT-OSS models';