DELETE FROM ${flyway:defaultSchema}.AIModel WHERE ID ='7D9762F8-5332-F011-A5F1-6045BDD9AD00'
INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('7D9762F8-5332-F011-A5F1-6045BDD9AD00', 'Mistral Large','Mistral Large Model - Latest','Mistral AI','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',8,1,'MistralLLM','mistral-large-latest')

DELETE FROM ${flyway:defaultSchema}.AIModel WHERE ID ='7E9762F8-5332-F011-A5F1-6045BDD9AD00'
INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('7E9762F8-5332-F011-A5F1-6045BDD9AD00', 'Mistral Medium','Mistral Medium Model - Latest','Mistral AI','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',6,1,'MistralLLM','mistral-medium-latest')

DELETE FROM ${flyway:defaultSchema}.AIModel WHERE ID ='F7D2EE33-2134-F011-A5F1-6045BDD9AD00'
INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ('F7D2EE33-2134-F011-A5F1-6045BDD9AD00', 'Groq Compound','Compound Agent Model from Groq','Groq','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',8,1,'GroqLLM','compound-beta')
