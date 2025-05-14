UPDATE ${flyway:defaultSchema}.AIModel SET APIName='claude-3-5-sonnet-latest' WHERE ID='5D218BCF-B7F6-439E-97FD-DC3A79432562'
 
DELETE FROM ${flyway:defaultSchema}.AIModel WHERE ID ='5066433E-F36B-1410-8DA9-00021F8B792E'
INSERT INTO ${flyway:defaultSchema}.AIModel ( ID, Name, Description, Vendor, AIModelTypeID, PowerRank, IsActive, DriverClass, APIName)  VALUES
                         ( '5066433E-F36B-1410-8DA9-00021F8B792E', 'Claude 3.7 Sonnet','Claude 3.7 Sonnet','Anthropic','E8A5CCEC-6A37-EF11-86D4-000D3A4E707E',9,1,'AnthropicLLM','claude-3-7-sonnet-latest')
