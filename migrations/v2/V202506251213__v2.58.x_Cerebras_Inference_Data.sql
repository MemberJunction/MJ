
-- Update models to not say Groq in name, Groq is one of the inferencer providers for these models
UPDATE ${flyway:defaultSchema}.AIModel SET Name='Deepseek R1 Distill Llama 3.3 70B' WHERE ID='845D433E-F36B-1410-8DA9-00021F8B792E'
UPDATE ${flyway:defaultSchema}.AIModel SET Name ='Llama 3.3 70B Versatile' WHERE ID='853E890E-F2E3-EF11-B015-286B35C04427'	
UPDATE ${flyway:defaultSchema}.AIModel SET Name ='Llama 4 Maverick' WHERE ID='8A5D433E-F36B-1410-8DA9-00021F8B792E'	
UPDATE ${flyway:defaultSchema}.AIModel SET Name ='Llama 4 Scout' WHERE ID='875D433E-F36B-1410-8DA9-00021F8B792E'	

-- Create Cerebras AI Vendor
DECLARE @CerebrasID NVARCHAR(50);
SELECT @CerebrasID='3EDA433E-F36B-1410-8DB6-00021F8B792E'

-- Add Cerebras as inference provider for Llama 4 Scout, LLama 3.18B Llama 3.370b, Deepseek R1 Distill and Qwen3 32B
INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description) VALUES (@CerebrasID,'Cerebras','Cerebras AI Inference Cloud')

-- Now add the models to the vendor
INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, TypeID, ModelID, VendorID, DriverClass, APIName )
VALUES
('55DA433E-F36B-1410-8DB6-00021F8B792E', '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', '853E890E-F2E3-EF11-B015-286B35C04427',@CerebrasID, 'CerebrasLLM', 'llama-3.3-70b') -- Llama 3.3 70 B Versatile

INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, TypeID, ModelID, VendorID, DriverClass, APIName )
VALUES
('5ADA433E-F36B-1410-8DB6-00021F8B792E', '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', 'F126ED5B-97B3-49E7-BD3B-E796B2099231',@CerebrasID, 'CerebrasLLM', 'llama3.1-8b') -- Llama 3.1 8b

INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, TypeID, ModelID, VendorID, DriverClass, APIName )
VALUES
('5FDA433E-F36B-1410-8DB6-00021F8B792E', '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', '875D433E-F36B-1410-8DA9-00021F8B792E',@CerebrasID, 'CerebrasLLM', 'llama-4-scout-17b-16e-instruct') -- Llama 4 Scout

INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, TypeID, ModelID, VendorID, DriverClass, APIName )
VALUES
('64DA433E-F36B-1410-8DB6-00021F8B792E', '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', '845D433E-F36B-1410-8DA9-00021F8B792E',@CerebrasID, 'CerebrasLLM', 'deepseek-r1-distill-llama-70b') -- Deepseek R1 Distill

INSERT INTO ${flyway:defaultSchema}.AIModelVendor ( ID, TypeID, ModelID, VendorID, DriverClass, APIName )
VALUES
('69DA433E-F36B-1410-8DB6-00021F8B792E', '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3', 'C496B988-4EA4-4D7E-A6DD-255F56D93933', @CerebrasID, 'CerebrasLLM', 'qwen-3-32b') -- Qwen 3 32B
