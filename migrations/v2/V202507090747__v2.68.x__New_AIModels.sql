-- Add Qwen 3 235B model to the database
INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
VALUES
('46B2443E-F36B-1410-8DB7-00021F8B792E', 
 'Qwen 3 235B',
 'Largest Qwen 3 series model. Provides advanced multilingual language model from the Qwen series supporting 100+ languages. Offers strong reasoning, instruction-following, and creative writing capabilities with efficient performance for general-purpose dialogue and complex logical tasks.',
 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 12, 1)
-- Associate the model with Cerebras as a vendor
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, DriverClass, APIName, MaxInputTokens)
VALUES ('4CB2443E-F36B-1410-8DB7-00021F8B792E', '46B2443E-F36B-1410-8DB7-00021F8B792E','3EDA433E-F36B-1410-8DB6-00021F8B792E','CerebrasLLM','qwen-3-235b',128000)
