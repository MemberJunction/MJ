-- Add EffortLevel to AIModel table
ALTER TABLE [${flyway:defaultSchema}].[AIModel] ADD SupportsEffortLevel BIT NOT NULL DEFAULT 0;

-- Extended property for SupportsEffortLevel column 
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Specifies if the model supports the concept of an effort level. For example, for a reasoning model, the options often include low, medium, and high.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'AIModel',
    @level2type = N'Column', @level2name = N'SupportsEffortLevel';

-- Add reasoning models to AIModel table
INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('5A4DF845-F821-F011-8B3D-000D3A9E3408'
           ,'Gemini 2.0 Flash'
           ,'Next-gen features and improved capabilities, including superior speed, native tool use, multimodal generation, and a 1M token context window.'
           ,'Google'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'GeminiLLM'
           ,NULL
           ,'gemini-2.0-flash'
           ,'2025-04-25 17:11:06.7966667 +00:00'
           ,'2025-04-25 17:11:06.7966667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1048576
           ,'Any, JSON',
           0);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('0C93395D-F821-F011-8B3D-000D3A9E3408'
           ,'Gemini 2.0 Flash-Lite'
           ,'A Gemini 2.0 Flash model optimized for cost efficiency and low latency.'
           ,'Google'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'GeminiLLM'
           ,NULL
           ,'gemini-2.0-flash-lite'
           ,'2025-04-25 17:11:45.8133333 +00:00'
           ,'2025-04-25 17:11:45.8133333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1048576
           ,'Any, JSON', 
           0);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('791C357A-F821-F011-8B3D-000D3A9E3408'
           ,'Gemini 1.5 Flash'
           ,'Gemini 1.5 Flash is a fast and versatile multimodal model for scaling across diverse tasks.'
           ,'Google'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'GeminiLLM'
           ,NULL
           ,'gemini-1.5-flash'
           ,'2025-04-25 17:12:34.4366667 +00:00'
           ,'2025-04-25 17:12:34.4366667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1048576
           ,'Any, JSON',
           0);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('9604B1A4-3A21-F011-8B3D-7C1E5249773E'
           ,'GPT 4.1 mini'
           ,'GPT 4.1 mini'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,4
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'gpt-4.1-mini'
           ,'2025-04-24 18:33:41.3400000 +00:00'
           ,'2025-04-24 18:33:41.3400000 +00:00'
           ,0
           ,0
           ,NULL
           ,1000000
           ,'Any, JSON',
           0);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('E1095D3C-E821-F011-8B3D-000D3A9E3408'
           ,'GPT o4-mini'
           ,'Smaller model optimized for fast, cost-efficient reasoning'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,6
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o4-mini'
           ,'2025-04-25 15:16:18.7366667 +00:00'
           ,'2025-04-25 15:16:18.7366667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('03080654-F721-F011-8B3D-000D3A9E3408'
           ,'GPT o3'
           ,'Well-rounded and powerful model across domains. It sets a new standard for math, science, coding, and visual reasoning tasks. It also excels at technical writing and instruction-following. Use it to think through multi-step problems that involve analysis across text, code, and images.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o3'
           ,'2025-04-25 17:04:20.8766667 +00:00'
           ,'2025-04-25 17:04:20.8766667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('A647667B-F721-F011-8B3D-000D3A9E3408'
           ,'GPT o3-mini'
           ,'small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini. o3-mini supports key developer features, like Structured Outputs, function calling, and Batch API.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o3-mini'
           ,'2025-04-25 17:05:26.9400000 +00:00'
           ,'2025-04-25 17:05:26.9400000 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('D8B332B2-F721-F011-8B3D-000D3A9E3408'
           ,'GPT o1'
           ,'The o1 series of models are trained with reinforcement learning to perform complex reasoning. o1 models think before they answer, producing a long internal chain of thought before responding to the user.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o1'
           ,'2025-04-25 17:06:58.8866667 +00:00'
           ,'2025-04-25 17:06:58.8866667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('E54347C3-F721-F011-8B3D-000D3A9E3408'
           ,'GPT o1-mini'
           ,'The o1 reasoning model is designed to solve hard problems across domains. o1-mini is a faster and more affordable reasoning model, but we recommend using the newer o3-mini model that features higher intelligence at the same latency and price as o1-mini.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o1-mini'
           ,'2025-04-25 17:07:27.5333333 +00:00'
           ,'2025-04-25 17:07:27.5333333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);
GO

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('913EC3DB-F721-F011-8B3D-000D3A9E3408'
           ,'GPT o1-pro'
           ,'Version of o1 with more compute for better responses'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o1-pro'
           ,'2025-04-25 17:08:08.6133333 +00:00'
           ,'2025-04-25 17:08:08.6133333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);
GO

-- Add Agent Note Types for Skip
INSERT INTO [${flyway:defaultSchema}].[AIAgentNoteType]
           ([ID]
           ,[Name]
           ,[Description])
     VALUES
           ('C49BBEA7-5424-F011-A770-AC1A3D21423D'
           ,'Human'
           ,'Notes added by a Human')
GO

INSERT INTO [${flyway:defaultSchema}].[AIAgentNoteType]
           ([ID]
           ,[Name]
           ,[Description])
     VALUES
           ('C59BBEA7-5424-F011-A770-AC1A3D21423D'
           ,'AI'
           ,'Notes added by an AI')
GO