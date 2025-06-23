-- Migration to seed AI Model Costs for OpenAI, Anthropic, Mistral, and Groq models
-- Pricing as of January 2025
-- All prices are in USD per million tokens

-- OpenAI Models
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments, __mj_CreatedAt, __mj_UpdatedAt)
VALUES
    -- GPT-4o
    ('0122f53d-e449-4bb7-a11a-410181753aff', 'e6a5ccec-6a37-ef11-86d4-000d3a4e707e', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD', 
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 2.50, 10.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime', 
     'GPT-4o pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- GPT-4o-mini
    ('92f3c25b-afd7-4c6d-8656-9b085396bce8', '0ae8548e-30a6-4fbc-8f69-6344d0cbaf2d', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.15, 0.60, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'GPT-4o-mini pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- o1
    ('68ee9d5d-7183-4f2a-b211-4afcc0b01587', 'd8b332b2-f721-f011-8b3d-000d3a9e3408', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 15.00, 60.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'o1 reasoning model pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- o1-mini
    ('9fce61be-c582-46a9-b59d-81f73450c0e6', 'e54347c3-f721-f011-8b3d-000d3a9e3408', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 3.00, 12.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'o1-mini pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- o3-mini
    ('e9cc9b7b-799a-4069-9e54-4d3dff334e12', 'a647667b-f721-f011-8b3d-000d3a9e3408', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 1.10, 4.40, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'o3-mini pricing as of Jan 2025', GETDATE(), GETDATE()),

-- Anthropic Models
    -- Claude 4 Opus
    ('a727c77a-6f00-4990-9e1d-67b95f49ccf5', '83c5433e-f36b-1410-8dab-00021f8b792e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 15.00, 75.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Claude 4 Opus pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Claude 4 Sonnet
    ('6c644b8c-cb68-461d-a00b-36f62855539b', '89c5433e-f36b-1410-8dab-00021f8b792e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 3.00, 15.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Claude 4 Sonnet pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Claude 3.7 Sonnet
    ('1c4c94b7-3d9e-4fdb-be0c-6fad82a4ecbe', '5066433e-f36b-1410-8da9-00021f8b792e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 3.00, 15.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Claude 3.7 Sonnet pricing as of Jan 2025 (same as Claude 4 Sonnet)', GETDATE(), GETDATE()),
    
    -- Claude 3.5 Sonnet
    ('7c026453-4873-454f-b861-3e6cdbab944f', '5d218bcf-b7f6-439e-97fd-dc3a79432562', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 3.00, 15.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Claude 3.5 Sonnet pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Claude 3 Opus
    ('6ab0ae41-58cf-44b9-9214-b165b2108100', 'e1a5ccec-6a37-ef11-86d4-000d3a4e707e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 15.00, 75.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Claude 3 Opus pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Claude 3 Haiku
    ('e05c90b8-6cd1-470e-ad11-fd592cf93afb', 'dfa5ccec-6a37-ef11-86d4-000d3a4e707e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.25, 1.25, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Claude 3 Haiku pricing as of Jan 2025', GETDATE(), GETDATE()),

-- Mistral Models
    -- Mistral Large
    ('4be324bb-70a8-420b-be87-0cda6ece336d', '7d9762f8-5332-f011-a5f1-6045bdd9ad00', 'dba5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 4.00, 12.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Mistral Large pricing as of Jan 2025 (estimated)', GETDATE(), GETDATE()),
    
    -- Mistral Medium
    ('675e5e06-184c-4503-a457-3594b9946c25', '7e9762f8-5332-f011-a5f1-6045bdd9ad00', 'dba5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 2.75, 8.10, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Mistral Medium pricing as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Mixtral 8x7B
    ('f95a5535-5a03-468c-89b4-ffddfa7efac0', 'e2a5ccec-6a37-ef11-86d4-000d3a4e707e', 'dba5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.70, 0.70, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Mixtral 8x7B pricing as of Jan 2025 (estimated)', GETDATE(), GETDATE()),

-- Groq Models
    -- Llama 4 Scout
    ('c0780a29-bc07-430c-b1b8-eb182183f820', '875d433e-f36b-1410-8da9-00021f8b792e', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.11, 0.34, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Llama 4 Scout pricing on Groq as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Llama 4 Maverick
    ('8c917bf3-1b35-49c3-941b-397effd0e7f4', '8a5d433e-f36b-1410-8da9-00021f8b792e', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.50, 0.77, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Llama 4 Maverick pricing on Groq as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Llama 3.3 70B Versatile
    ('1c25c80a-8952-4edf-8ab4-428e7d296525', '853e890e-f2e3-ef11-b015-286b35c04427', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.59, 0.79, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Llama 3.3 70B Versatile pricing on Groq as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Llama 3.1 8B
    ('4f83f994-d8f3-4062-b883-8775dde73e0a', '1d9493ce-1af6-49f6-b2ea-eabcab491571', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.05, 0.08, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Llama 3.1 8B pricing on Groq as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Llama 3.1 405B
    ('e75f641a-5bf8-411c-95f3-06b26ebbd96e', '16afb4a5-3343-40c7-8982-03f979a15ae0', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 2.50, 2.50, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Llama 3.1 405B pricing on Groq as of Jan 2025 (estimated)', GETDATE(), GETDATE()),
    
    -- Llama 3 70B
    ('1a7d0e0c-a604-424b-97de-086e9d649584', 'e7a5ccec-6a37-ef11-86d4-000d3a4e707e', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.70, 0.80, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Llama 3 70B pricing on Groq as of Jan 2025 (estimated)', GETDATE(), GETDATE()),
    
    -- Deepseek R1 Distill Llama 70B
    ('7d562c72-384e-463e-8c9a-6511f35cd4c5', '845d433e-f36b-1410-8da9-00021f8b792e', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.59, 0.79, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Deepseek R1 Distill Llama 70B pricing on Groq as of Jan 2025 (same as Llama 3.3 70B)', GETDATE(), GETDATE()),

-- Batch Processing Discounts (50% off for Anthropic)
    -- Claude 4 Opus Batch
    ('f6c1fdb8-7bef-4946-b3f8-b194b474543a', '83c5433e-f36b-1410-8dab-00021f8b792e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 7.50, 37.50, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Batch',
     'Claude 4 Opus batch pricing (50% discount) as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Claude 4 Sonnet Batch
    ('5dda609e-8445-467e-be78-ee31bcc385b7', '89c5433e-f36b-1410-8dab-00021f8b792e', 'daa5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 1.50, 7.50, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Batch',
     'Claude 4 Sonnet batch pricing (50% discount) as of Jan 2025', GETDATE(), GETDATE()),

-- Groq Batch Processing (25% discount)
    -- Llama 4 Scout Batch
    ('da3a0e18-83dd-4329-ac87-0d8e9d563f01', '875d433e-f36b-1410-8da9-00021f8b792e', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.0825, 0.255, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Batch',
     'Llama 4 Scout batch pricing on Groq (25% discount) as of Jan 2025', GETDATE(), GETDATE()),
    
    -- Llama 4 Maverick Batch
    ('cca0a4dc-497d-4e11-bebb-392e0074a7ca', '8a5d433e-f36b-1410-8da9-00021f8b792e', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.375, 0.5775, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Batch',
     'Llama 4 Maverick batch pricing on Groq (25% discount) as of Jan 2025', GETDATE(), GETDATE());





INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments, __mj_CreatedAt, __mj_UpdatedAt)
VALUES
    -- GPT 4.1
    ('096c8d65-c5a7-4bb6-b146-7dfaa947b14a', '287e317f-bf26-f011-a770-ac1a3d21423d', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 2.00, 8.00, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'GPT 4.1 pricing as of Jan 2025 - 1M token context window', GETDATE(), GETDATE()),
    
    -- GPT 4.1-mini
    ('1bcf9014-50c4-4129-9e28-0cb286017c3c', '9604b1a4-3a21-f011-8b3d-7c1e5249773e', 'd8a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.40, 1.60, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'GPT 4.1-mini pricing as of Jan 2025 - 1M token context window', GETDATE(), GETDATE()),
    
    -- Qwen 3 32B on Groq (using QwQ-32B pricing as reference)
    ('d1f6f522-20dd-4d86-9deb-a4f2a3549cc6', 'c496b988-4ea4-4d7e-a6dd-255f56d93933', 'e3a5ccec-6a37-ef11-86d4-000d3a4e707e', GETDATE(), NULL, 'Active', 'USD',
     'ece2bcb7-c854-4bf7-a517-d72793a40652', 0.29, 0.39, '54208f7d-331c-40ab-84e8-163338ee9ea1', 'Realtime',
     'Qwen 3 32B pricing on Groq as of Jan 2025 (based on QwQ-32B pricing)', GETDATE(), GETDATE());     