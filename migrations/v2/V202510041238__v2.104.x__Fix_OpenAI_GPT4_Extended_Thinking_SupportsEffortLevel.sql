-- Migration: Fix OpenAI GPT-4 Extended Thinking SupportsEffortLevel
-- Description: Set SupportsEffortLevel to 0 (false) for OpenAI GPT-4 models with extended thinking
--              as OpenAI does not support effort level parameter for these models
-- Version: 2.104.x
-- Date: 2025-10-04

-- Declare hardcoded UUIDs for OpenAI vendor and affected models
DECLARE @AIVendorID_OpenAI UNIQUEIDENTIFIER = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E',
        @AIModelID_GPT4_1 UNIQUEIDENTIFIER = '287E317F-BF26-F011-A770-AC1A3D21423D',
        @AIModelID_GPT4_1_NANO UNIQUEIDENTIFIER = '1BEC0566-9D7B-4A83-9701-DF5602A607EF';

-- Update AIModelVendor records to disable SupportsEffortLevel for OpenAI GPT-4 extended thinking models
UPDATE
    [${flyway:defaultSchema}].AIModelVendor
SET
    SupportsEffortLevel = 0
WHERE
    SupportsEffortLevel = 1
    AND VendorID = @AIVendorID_OpenAI
    AND ModelID IN (@AIModelID_GPT4_1, @AIModelID_GPT4_1_NANO);
