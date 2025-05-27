-- Opus 4
INSERT INTO ${flyway:defaultSchema}.AIModel ( ID, Name, Description, AIModelTypeID, PowerRank, IsActive)  VALUES
                         ( '83C5433E-F36B-1410-8DAB-00021F8B792E', 'Claude 4 Opus','Claude Largest Model','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',12,1)

INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, ModelID, VendorID, APIName, Priority, Status, DriverClass, SupportsEffortLevel, SupportsStreaming) VALUES
                               ( '87C5433E-F36B-1410-8DAB-00021F8B792E', '83C5433E-F36B-1410-8DAB-00021F8B792E', 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'claude-opus-4-20250514', 1, 'Active', 'AnthropicLLM', 1, 1)

-- Sonnet 4
INSERT INTO ${flyway:defaultSchema}.AIModel ( ID, Name, Description, AIModelTypeID, PowerRank, IsActive)  VALUES
                         ( '89C5433E-F36B-1410-8DAB-00021F8B792E', 'Claude 4 Sonnet','Claude Medium Model','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',10,1)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, ModelID, VendorID, APIName, Priority, Status, DriverClass, SupportsEffortLevel, SupportsStreaming) VALUES
                               ( '8BC5433E-F36B-1410-8DAB-00021F8B792E', '89C5433E-F36B-1410-8DAB-00021F8B792E', 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'claude-sonnet-4-20250514', 1, 'Active', 'AnthropicLLM', 1, 1)
