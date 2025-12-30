-- Add Vertex AI vendor and model-vendor relationships
-- This migration adds Google Cloud Vertex AI as an inference provider for Gemini models
--
-- Vertex AI provides enterprise-grade access to Google's Gemini models through GCP,
-- offering features like VPC-SC, customer-managed encryption keys, and regional deployments.
--
-- The VertexLLM driver class extends GeminiLLM and uses the unified @google/genai SDK
-- with vertexai: true configuration for GCP authentication.

-- Declare variables for cleaner script
DECLARE @VertexAIVendorID UNIQUEIDENTIFIER = 'E41E970D-7D38-45D9-BBFC-4013FF7C5860';
DECLARE @ModelDeveloperTypeID UNIQUEIDENTIFIER = '10DB468E-F2CE-475D-9F39-2DF2DE75D257';
DECLARE @InferenceProviderTypeID UNIQUEIDENTIFIER = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3';

-- Gemini Model IDs
DECLARE @Gemini10Ultra UNIQUEIDENTIFIER = 'E5A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @Gemini15Flash UNIQUEIDENTIFIER = '791C357A-F821-F011-8B3D-000D3A9E3408';
DECLARE @Gemini15Pro UNIQUEIDENTIFIER = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @Gemini20Flash UNIQUEIDENTIFIER = '5A4DF845-F821-F011-8B3D-000D3A9E3408';
DECLARE @Gemini20FlashLite UNIQUEIDENTIFIER = '0C93395D-F821-F011-8B3D-000D3A9E3408';
DECLARE @Gemini25Flash UNIQUEIDENTIFIER = '072969C3-7D19-43FF-83E9-051E7A2D3586';
DECLARE @Gemini25FlashPreview UNIQUEIDENTIFIER = '905D433E-F36B-1410-8DA9-00021F8B792E';
DECLARE @Gemini25FlashLite UNIQUEIDENTIFIER = '13297942-3AE2-4584-832C-551237847140';
DECLARE @Gemini25Pro UNIQUEIDENTIFIER = 'C478D8CD-9D81-491A-9992-139F45789309';
DECLARE @Gemini25ProPreview UNIQUEIDENTIFIER = '8D5D433E-F36B-1410-8DA9-00021F8B792E';
DECLARE @Gemini3Flash UNIQUEIDENTIFIER = '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45';
DECLARE @Gemini3Pro UNIQUEIDENTIFIER = 'B7267218-302B-4C09-9875-8DF06AAA1695';

-- Insert Vertex AI vendor record
INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description)
VALUES (
    @VertexAIVendorID,
    'Vertex AI',
    'Google Cloud Platform''s Vertex AI service providing enterprise-grade access to Gemini models with GCP-native features including VPC-SC, CMEK, and regional deployments'
);

-- Link Vertex AI as a Model Developer (Google develops the models)
INSERT INTO ${flyway:defaultSchema}.AIVendorType (ID, VendorID, TypeID)
VALUES (
    '83AA4C14-23B5-4A75-86B6-FD739CF8D9FF',
    @VertexAIVendorID,
    @ModelDeveloperTypeID
);

-- Link Vertex AI as an Inference Provider (provides API access)
INSERT INTO ${flyway:defaultSchema}.AIVendorType (ID, VendorID, TypeID)
VALUES (
    '37CB4D46-215A-415E-B59C-DC0378E71600',
    @VertexAIVendorID,
    @InferenceProviderTypeID
);

-- Link all existing Gemini models to Vertex AI as Model Developer
-- Gemini 1.0 Ultra - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('2EC44AEE-5A84-4A82-B2E5-41FBFDCA6E92', @Gemini10Ultra, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 1.5 Flash - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('588005A3-EA4A-49DD-96E8-4B42A77352DB', @Gemini15Flash, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 1.5 Pro - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('80F2C48A-1E05-4EEE-BE7E-9FDB97D601A0', @Gemini15Pro, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.0 Flash - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('2397CBEF-C019-427A-801C-277E67AB5516', @Gemini20Flash, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.0 Flash-Lite - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('33DC9BDD-98EA-456B-92DE-9B8B472F77EC', @Gemini20FlashLite, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.5 Flash - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('25D7A091-950D-4547-8C17-6C06A0C9F062', @Gemini25Flash, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.5 Flash Preview - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('9F409F2C-B54F-452E-8543-9F446F3D0E78', @Gemini25FlashPreview, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.5 Flash-Lite - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('0B4E2038-ADC3-4317-BC14-C5C4924EC37A', @Gemini25FlashLite, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.5 Pro - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('78C30137-C98D-4D9E-8D35-B4A6384A00B0', @Gemini25Pro, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 2.5 Pro Preview - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('9FE0B48D-6E59-4250-9FC8-82F33ADCD77E', @Gemini25ProPreview, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 3 Flash - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('CBD101EC-F8F3-4E6B-8739-7844295E998C', @Gemini3Flash, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Gemini 3 Pro - Model Developer
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, SupportsStreaming)
VALUES ('1D529CD2-762D-421E-8B6A-1695E95EE6C5', @Gemini3Pro, @VertexAIVendorID, @ModelDeveloperTypeID, 5, 'Active', NULL, 1);

-- Link all existing Gemini models to Vertex AI as Inference Provider
-- Gemini 1.0 Ultra - Inference Provider (Deprecated - no longer available)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('BA9EF45F-0DB9-4EF5-9D31-624909C8C9F2', @Gemini10Ultra, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Deprecated', 'VertexLLM', 'gemini-ultra', 1, 0, 'Any, JSON');

-- Gemini 1.5 Flash - Inference Provider (Retired April 2025)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('A6130168-A4AB-4C09-ABBA-D424333ECB2D', @Gemini15Flash, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Deprecated', 'VertexLLM', 'gemini-1.5-flash-002', 1, 1, 'Any, JSON');

-- Gemini 1.5 Pro - Inference Provider (Retired April 2025)
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('736F7D8B-9B99-4928-B844-761DC51134C5', @Gemini15Pro, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Deprecated', 'VertexLLM', 'gemini-1.5-pro-002', 1, 1, 'Any, JSON');

-- Gemini 2.0 Flash - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('89CDE840-35D6-411F-A35F-49F5DED4D088', @Gemini20Flash, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Active', 'VertexLLM', 'gemini-2.0-flash-001', 1, 1, 'Any, JSON');

-- Gemini 2.0 Flash-Lite - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('0F19601A-CD91-4D6D-B136-0C9D6DF0D837', @Gemini20FlashLite, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Active', 'VertexLLM', 'gemini-2.0-flash-lite-001', 1, 1, 'Any, JSON');

-- Gemini 2.5 Flash - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('E4FC6545-5208-44A0-B972-9E64FE250E71', @Gemini25Flash, @VertexAIVendorID, @InferenceProviderTypeID, 1, 'Active', 'VertexLLM', 'gemini-2.5-flash', 1, 1, 'Any, JSON');

-- Gemini 2.5 Flash Preview - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('F9162DA3-D5EE-403E-A4B4-87229808424A', @Gemini25FlashPreview, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Active', 'VertexLLM', 'gemini-2.5-flash-preview-04-17', 1, 1, 'Any, JSON');

-- Gemini 2.5 Flash-Lite - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('8480451B-E200-4353-9A4E-773297BC8531', @Gemini25FlashLite, @VertexAIVendorID, @InferenceProviderTypeID, 2, 'Active', 'VertexLLM', 'gemini-2.5-flash-lite', 1, 1, 'Any, JSON');

-- Gemini 2.5 Pro - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('814B0399-C8A3-4B54-837F-8A0DBD070957', @Gemini25Pro, @VertexAIVendorID, @InferenceProviderTypeID, 1, 'Active', 'VertexLLM', 'gemini-2.5-pro', 1, 1, 'Any, JSON');

-- Gemini 2.5 Pro Preview - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('6CACCDA6-8F28-49A2-B2C9-028742685913', @Gemini25ProPreview, @VertexAIVendorID, @InferenceProviderTypeID, 5, 'Active', 'VertexLLM', 'gemini-2.5-pro-preview-05-06', 1, 1, 'Any, JSON');

-- Gemini 3 Flash - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('58E6B771-74BC-46D0-9A02-5CA7FECFA7E0', @Gemini3Flash, @VertexAIVendorID, @InferenceProviderTypeID, 1, 'Active', 'VertexLLM', 'gemini-3-flash-preview', 1, 1, 'Any, JSON');

-- Gemini 3 Pro - Inference Provider
INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, TypeID, Priority, Status, DriverClass, APIName, SupportsStreaming, SupportsEffortLevel, SupportedResponseFormats)
VALUES ('DF5D1273-CFB5-424A-A499-19CAEFD1EC8C', @Gemini3Pro, @VertexAIVendorID, @InferenceProviderTypeID, 1, 'Active', 'VertexLLM', 'gemini-3-pro-preview', 1, 1, 'Any, JSON');

-- Add AI Model Cost records for Vertex AI pricing
-- Vertex AI pricing is the same as Google Gemini API pricing (both use same Google infrastructure)
-- Source: https://cloud.google.com/vertex-ai/generative-ai/pricing (January 2025)

DECLARE @TokenPriceTypeID UNIQUEIDENTIFIER = 'ECE2BCB7-C854-4BF7-A517-D72793A40652'; -- Tokens
DECLARE @Per1MTokensUnitTypeID UNIQUEIDENTIFIER = '54208F7D-331C-40AB-84E8-163338EE9EA1'; -- Per 1M Tokens
DECLARE @StartDate DATETIME2 = '2025-01-01';

-- Gemini 1.0 Ultra on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('013CFD06-CC9C-4C96-A187-31ED863FAAB5', @Gemini10Ultra, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.50, 2.00, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 1.0 Ultra pricing on Vertex AI as of January 2025');

-- Gemini 1.5 Flash on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('C6399A17-8519-4669-AD78-9E5DC2970E71', @Gemini15Flash, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.075, 0.30, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 1.5 Flash pricing on Vertex AI as of January 2025. Input ≤128K tokens: $0.075/M, >128K: $0.15/M. Output ≤128K: $0.30/M, >128K: $0.60/M. Base tier pricing shown.');

-- Gemini 1.5 Pro on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('3A52B620-239C-4978-8483-7ADD17738927', @Gemini15Pro, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 1.25, 5.00, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 1.5 Pro pricing on Vertex AI as of January 2025. Input ≤128K tokens: $1.25/M, >128K: $2.50/M. Output ≤128K: $5.00/M, >128K: $10.00/M. Base tier pricing shown.');

-- Gemini 2.0 Flash on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('B47C8F74-DD9B-4DC2-A327-40ECB87E213F', @Gemini20Flash, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.15, 0.60, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.0 Flash pricing on Vertex AI as of January 2025. Text input: $0.15/M. Text output: $0.60/M. Audio input: $1.00/M. Video input: $3.00/M.');

-- Gemini 2.0 Flash-Lite on Vertex AI (same as 2.0 Flash)
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('51933E2D-2595-4F15-8A65-79DFD2F6E8CA', @Gemini20FlashLite, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.15, 0.60, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.0 Flash-Lite pricing on Vertex AI as of January 2025 (same as 2.0 Flash)');

-- Gemini 2.5 Flash on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('BEF6C6CC-BED3-4AF6-AC9E-A20615C5C48E', @Gemini25Flash, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.30, 2.50, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.5 Flash pricing on Vertex AI as of January 2025');

-- Gemini 2.5 Flash Preview on Vertex AI (same as 2.5 Flash)
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('24468BC7-A013-4CC8-AA58-7FECE3FB7EEE', @Gemini25FlashPreview, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.30, 2.50, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.5 Flash Preview pricing on Vertex AI as of January 2025 (same as 2.5 Flash)');

-- Gemini 2.5 Flash-Lite on Vertex AI (same as 2.5 Flash)
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('F16A2D71-B4B5-4FE5-B9AC-22BED68BFC40', @Gemini25FlashLite, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.30, 2.50, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.5 Flash-Lite pricing on Vertex AI as of January 2025 (same as 2.5 Flash)');

-- Gemini 2.5 Pro on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('EACFE17A-1522-4FA2-BE37-0E402A222D68', @Gemini25Pro, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 1.25, 10.00, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.5 Pro pricing on Vertex AI as of January 2025. Input ≤200K tokens: $1.25/M, >200K: $2.50/M. Output ≤200K: $10.00/M, >200K: $15.00/M. Base tier pricing shown.');

-- Gemini 2.5 Pro Preview on Vertex AI (same as 2.5 Pro)
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('127AE955-8C26-4053-AF81-25C03D347770', @Gemini25ProPreview, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 1.25, 10.00, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 2.5 Pro Preview pricing on Vertex AI as of January 2025 (same as 2.5 Pro). Input ≤200K: $1.25/M, >200K: $2.50/M. Output ≤200K: $10.00/M, >200K: $15.00/M.');

-- Gemini 3 Flash on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('7867DB3D-7665-451E-84ED-FC8C8BA56893', @Gemini3Flash, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 0.50, 3.00, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 3 Flash pricing on Vertex AI as of January 2025 (also known as Gemini 2.0 Flash). Features 1M token context window.');

-- Gemini 3 Pro on Vertex AI
INSERT INTO ${flyway:defaultSchema}.AIModelCost (ID, ModelID, VendorID, StartedAt, EndedAt, Status, Currency, PriceTypeID, InputPricePerUnit, OutputPricePerUnit, UnitTypeID, ProcessingType, Comments)
VALUES ('77D9E0CE-E7E2-4F78-91BD-1E9FE736F4F2', @Gemini3Pro, @VertexAIVendorID, @StartDate, NULL, 'Active', 'USD', @TokenPriceTypeID, 2.00, 12.00, @Per1MTokensUnitTypeID, 'Realtime', 'Gemini 3 Pro pricing on Vertex AI as of January 2025. Input ≤200K tokens: $2.00/M, >200K: $4.00/M. Output ≤200K: $12.00/M, >200K: $18.00/M. Base tier pricing shown.');
GO
