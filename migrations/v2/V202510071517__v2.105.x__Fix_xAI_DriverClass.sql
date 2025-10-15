-- Fix x.ai DriverClass to match the registered TypeScript class name
-- Previous migrations set DriverClass to 'XAIService' but the actual registered class is 'xAILLM'

-- Update AIModelVendor records for all xAI models (inference provider associations only)
-- Grok Code Fast 1
UPDATE ${flyway:defaultSchema}.AIModelVendor
SET DriverClass = 'xAILLM'
WHERE ID = '73C58B9B-1470-470C-B2F1-F58662C9B583';

-- Grok 4
UPDATE ${flyway:defaultSchema}.AIModelVendor
SET DriverClass = 'xAILLM'
WHERE ID = '386BAA17-71D0-42D3-8B36-ABD9279AF319';

-- Grok 4 Fast Reasoning
UPDATE ${flyway:defaultSchema}.AIModelVendor
SET DriverClass = 'xAILLM'
WHERE ID = 'A3D5F812-9E64-4C71-B2A6-5CBD8F6FAE79';

-- Grok 4 Fast Non-Reasoning
UPDATE ${flyway:defaultSchema}.AIModelVendor
SET DriverClass = 'xAILLM'
WHERE ID = 'E1C7BC25-9F64-4D81-C2B6-6DCD0A7FBF89';

PRINT 'Updated xAI DriverClass from XAIService to xAILLM for all 4 Grok models';
