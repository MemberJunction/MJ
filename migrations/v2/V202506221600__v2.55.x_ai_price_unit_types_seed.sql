-- Migration to seed AI Model Price Unit Types
-- These define the different units used for AI model pricing (per 1M tokens, per 1K tokens, etc.)

-- Insert AI Model Price Unit Types
INSERT INTO ${flyway:defaultSchema}.AIModelPriceUnitType (ID, Name, Description, DriverClass, __mj_CreatedAt, __mj_UpdatedAt)
VALUES 
    -- Per Million Tokens (most common for modern LLMs like GPT-4, Claude)
    ('54208f7d-331c-40ab-84e8-163338ee9ea1', 
     'Per 1M Tokens', 
     'Pricing calculated per million tokens processed. This is the standard unit for most modern LLMs including OpenAI GPT-4, Anthropic Claude, and Google models.',
     'PerMillionTokens',
     GETDATE(), GETDATE()),
    
    -- Per Thousand Tokens (older models, some specialized providers)
    ('7d9ae8a6-5051-4cf1-a261-178958b03fd2', 
     'Per 1K Tokens', 
     'Pricing calculated per thousand tokens processed. Common for older models and some specialized providers.',
     'PerThousandTokens',
     GETDATE(), GETDATE()),
    
    -- Per Hundred Thousand Tokens (intermediate pricing tier)
    ('e09e39ed-6ca0-47a1-9b81-d581312efdf4', 
     'Per 100K Tokens', 
     'Pricing calculated per hundred thousand tokens processed. Used by some providers as an intermediate pricing tier.',
     'PerHundredThousandTokens',
     GETDATE(), GETDATE());

-- Insert AI Model Price Types (the metrics being priced)
INSERT INTO ${flyway:defaultSchema}.AIModelPriceType (ID, Name, Description, __mj_CreatedAt, __mj_UpdatedAt)
VALUES
    -- Tokens (most common)
    ('ece2bcb7-c854-4bf7-a517-d72793a40652',
     'Tokens',
     'Token-based pricing where costs are calculated based on the number of tokens processed (both input and output)',
     GETDATE(), GETDATE()),
    
    -- API Calls (for some simpler models)
    ('5254d39e-c3f8-481e-a300-3a600208984d',
     'API Calls',
     'Per-call pricing where each API request has a fixed cost regardless of token count',
     GETDATE(), GETDATE()),
    
    -- Processing Time (for compute-intensive models)
    ('82504284-7d03-4db2-8392-9c25a59f67d9',
     'Minutes',
     'Time-based pricing where costs are calculated per minute of processing time',
     GETDATE(), GETDATE());