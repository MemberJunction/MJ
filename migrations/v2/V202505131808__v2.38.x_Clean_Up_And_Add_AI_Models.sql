UPDATE ${flyway:defaultSchema}.AIModel SET Name='Llama 3.3 70B Versatile / Groq' WHERE ID='853E890E-F2E3-EF11-B015-286B35C04427'
UPDATE ${flyway:defaultSchema}.AIModel SET Name='GPT 4.1', APIName='gpt-4.1' WHERE ID='287E317F-BF26-F011-A770-AC1A3D21423D'
UPDATE ${flyway:defaultSchema}.AIModel SET Name='GPT 4.1-mini' WHERE ID='9604B1A4-3A21-F011-8B3D-7C1E5249773E'
UPDATE ${flyway:defaultSchema}.AIModel SET Name='GPT 4o-mini' WHERE ID='0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D'

INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('845D433E-F36B-1410-8DA9-00021F8B792E', 'Deepseek R1 Distill Llama 3.3 70B / Groq','Deepseek R1/Llama 3.3 70B Distillation','Groq','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',9,1,'GroqLLM','deepseek-r1-distill-llama-70b')

INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('875D433E-F36B-1410-8DA9-00021F8B792E', 'Llama 4 Scout / Groq','Smallest Llama 4 Model','Groq','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',7,1,'GroqLLM','meta-llama/llama-4-scout-17b-16e-instruct')

INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('8A5D433E-F36B-1410-8DA9-00021F8B792E', 'Llama 4 Maverick / Groq','Mid-sized Llama 4 Model','Groq','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',8,1,'GroqLLM','meta-llama/llama-4-maverick-17b-128e-instruct')

INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('8D5D433E-F36B-1410-8DA9-00021F8B792E', 'Gemini 2.5 Pro Preview','Gemini 2.5 Pro Preview Model','Google','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',7,1,'GeminiLLM','gemini-2.5-pro-preview-05-06')

INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('905D433E-F36B-1410-8DA9-00021F8B792E', 'Gemini 2.5 Flash Preview','Gemini 2.5 Flash Preview Model','Google','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',7,1,'GeminiLLM','gemini-2.5-flash-preview-04-17')