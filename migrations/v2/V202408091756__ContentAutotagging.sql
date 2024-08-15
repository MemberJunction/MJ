/****************************************************************************************
Content Autotagging Tables
****************************************************************************************/
/****** Object:  Table [${flyway:defaultSchema}].[ContentFileType]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentFileType](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[Name] [nvarchar](255) NOT NULL,
	[FileExtension] [nvarchar](255) NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentFileType] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentItem]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentItem](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[ContentSourceID] [uniqueidentifier] NOT NULL,
	[Name] [nvarchar](250) NULL,
	[Description] [nvarchar](max) NULL,
	[ContentTypeID] [uniqueidentifier] NOT NULL,
	[ContentSourceTypeID] [uniqueidentifier] NOT NULL,
	[ContentFileTypeID] [uniqueidentifier] NOT NULL,
	[Checksum] [nvarchar](100) NULL,
	[URL] [nvarchar](2000) NOT NULL,
	[Text] [nvarchar](max) NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentItem] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentItemAttribute]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentItemAttribute](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[ContentItemID] [uniqueidentifier] NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Value] [nvarchar](max) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentItemAttribute] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentItemTag]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentItemTag](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[ItemID] [uniqueidentifier] NOT NULL,
	[Tag] [nvarchar](200) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentItemTag] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentProcessRun]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentProcessRun](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[SourceID] [uniqueidentifier] NOT NULL,
	[StartTime] [datetime] NULL,
	[EndTime] [datetime] NULL,
	[Status] [nvarchar](100) NULL,
	[ProcessedItems] [int] NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentProcessRun] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentSource]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentSource](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[Name] [nvarchar](255) NULL,
	[ContentTypeID] [uniqueidentifier] NOT NULL,
	[ContentSourceTypeID] [uniqueidentifier] NOT NULL,
	[ContentFileTypeID] [uniqueidentifier] NOT NULL,
	[URL] [nvarchar](2000) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSource] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentSourceParam]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentSourceParam](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[ContentSourceID] [uniqueidentifier] NOT NULL,
	[ContentSourceTypeParamID] [uniqueidentifier] NOT NULL,
	[Value] [nvarchar](max) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSourceParam] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentSourceType]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentSourceType](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[Name] [nvarchar](255) NOT NULL,
	[Description] [nvarchar](1000) NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSourceType] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentSourceTypeParam]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentSourceTypeParam](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[Name] [nvarchar](100) NOT NULL,
	[Description] [nvarchar](max) NULL,
	[Type] [nvarchar](50) NULL,
	[DefaultValue] [nvarchar](max) NULL,
	[IsRequired] [bit] NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSourceTypeParam] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentType]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentType](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[Name] [nvarchar](255) NOT NULL,
	[Description] [nvarchar](max) NULL,
	[AIModelID] [uniqueidentifier] NOT NULL,
	[MinTags] [int] NOT NULL,
	[MaxTags] [int] NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentType] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [${flyway:defaultSchema}].[ContentTypeAttribute]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [${flyway:defaultSchema}].[ContentTypeAttribute](
	[ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
	[ContentTypeID] [uniqueidentifier] NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Prompt] [nvarchar](max) NOT NULL,
	[Description] [nvarchar](max) NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentTypeAttribute] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentFileType] ADD  CONSTRAINT [DF__ContentFi____mj___799DF262]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentFileType] ADD  CONSTRAINT [DF__ContentFi____mj___7A92169B]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] ADD  CONSTRAINT [DF__ContentIt____mj___7B863AD4]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] ADD  CONSTRAINT [DF__ContentIt____mj___7C7A5F0D]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute] ADD  CONSTRAINT [DF__ContentIt____mj___7D6E8346]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute] ADD  CONSTRAINT [DF__ContentIt____mj___7E62A77F]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag] ADD  CONSTRAINT [DF__ContentIt____mj___11757BF3]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag] ADD  CONSTRAINT [DF__ContentIt____mj___1269A02C]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] ADD  CONSTRAINT [DF__ContentPr____mj___7F56CBB8]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] ADD  CONSTRAINT [DF__ContentPr____mj___004AEFF1]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] ADD  CONSTRAINT [DF__ContentSo____mj___013F142A]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] ADD  CONSTRAINT [DF__ContentSo____mj___02333863]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam] ADD  CONSTRAINT [DF__ContentSo____mj___03275C9C]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam] ADD  CONSTRAINT [DF__ContentSo____mj___041B80D5]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceType] ADD  CONSTRAINT [DF__ContentSo____mj___0AC87E64]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceType] ADD  CONSTRAINT [DF__ContentSo____mj___0BBCA29D]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceTypeParam] ADD  CONSTRAINT [DF__ContentSo____mj___050FA50E]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceTypeParam] ADD  CONSTRAINT [DF__ContentSo____mj___0603C947]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentType] ADD  CONSTRAINT [DF__ContentTy____mj___06F7ED80]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentType] ADD  CONSTRAINT [DF__ContentTy____mj___07EC11B9]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentTypeAttribute] ADD  CONSTRAINT [DF__ContentTy____mj___08E035F2]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentTypeAttribute] ADD  CONSTRAINT [DF__ContentTy____mj___09D45A2B]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [${flyway:defaultSchema}].[AIModel]  WITH CHECK ADD  CONSTRAINT [FK_AIModel_AIModelType] FOREIGN KEY([AIModelTypeID])
REFERENCES [${flyway:defaultSchema}].[AIModelType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[AIModel] CHECK CONSTRAINT [FK_AIModel_AIModelType]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentFileTypeID] FOREIGN KEY([ContentFileTypeID])
REFERENCES [${flyway:defaultSchema}].[ContentFileType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentFileTypeID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentSourceID] FOREIGN KEY([ContentSourceID])
REFERENCES [${flyway:defaultSchema}].[ContentSource] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentSourceID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentSourceTypeID] FOREIGN KEY([ContentSourceTypeID])
REFERENCES [${flyway:defaultSchema}].[ContentSourceType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentSourceTypeID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentTypeID] FOREIGN KEY([ContentTypeID])
REFERENCES [${flyway:defaultSchema}].[ContentType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentTypeID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute]  WITH CHECK ADD  CONSTRAINT [FK_ContentItemAttribute_ContentItemID] FOREIGN KEY([ContentItemID])
REFERENCES [${flyway:defaultSchema}].[ContentItem] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute] CHECK CONSTRAINT [FK_ContentItemAttribute_ContentItemID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag]  WITH CHECK ADD  CONSTRAINT [FK_ContentItemTag_ContentItemID] FOREIGN KEY([ItemID])
REFERENCES [${flyway:defaultSchema}].[ContentItem] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag] CHECK CONSTRAINT [FK_ContentItemTag_ContentItemID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun]  WITH CHECK ADD  CONSTRAINT [FK_ContentProcessRun_ContentSourceID] FOREIGN KEY([SourceID])
REFERENCES [${flyway:defaultSchema}].[ContentSource] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] CHECK CONSTRAINT [FK_ContentProcessRun_ContentSourceID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentFileTypeID] FOREIGN KEY([ContentFileTypeID])
REFERENCES [${flyway:defaultSchema}].[ContentFileType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentFileTypeID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentSourceTypeID] FOREIGN KEY([ContentSourceTypeID])
REFERENCES [${flyway:defaultSchema}].[ContentSourceType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentSourceTypeID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentTypeID] FOREIGN KEY([ContentTypeID])
REFERENCES [${flyway:defaultSchema}].[ContentType] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentTypeID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam]  WITH CHECK ADD  CONSTRAINT [FK_ContentSourceParam_ContentSourceID] FOREIGN KEY([ContentSourceID])
REFERENCES [${flyway:defaultSchema}].[ContentSource] ([ID])
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam] CHECK CONSTRAINT [FK_ContentSourceParam_ContentSourceID]
GO
ALTER TABLE [${flyway:defaultSchema}].[ContentType]  WITH CHECK ADD  CONSTRAINT [FK_AIModel_mj_AIModel] FOREIGN KEY([AIModelID])
REFERENCES [${flyway:defaultSchema}].[AIModel] ([ID])
GO

/****************************************************************************************
AI Models Table Additions
****************************************************************************************/
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
           ,[CostRank])
     VALUES
           ('16afb4a5-3343-40c7-8982-03f979a15ae0'
           ,'Llama 3.1 405b'
           ,'Llama 3.1 405 billion parameters'
           ,'Groq'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,5
           ,1
           ,'GroqLLM'
           ,NULL
           ,'llama-3.1-405b-reasoning'
           ,getdate()	
           ,getdate()
           ,NULL
           ,NULL)

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
           ,[CostRank])
     VALUES
           ('f126ed5b-97b3-49e7-bd3b-e796b2099231'
           ,'Llama 3.1 70b'
           ,'Llama 3.1 70 billion parameters'
           ,'Groq'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,4
           ,1
           ,'GroqLLM'
           ,NULL
           ,'llama-3.1-70b-versatile'
           ,getdate()	
           ,getdate()
           ,NULL
           ,NULL)

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
           ,[CostRank])
     VALUES
           ('1d9493ce-1af6-49f6-b2ea-eabcab491571'
           ,'Llama 3.1 8b'
           ,'Llama 3.1 8 billion parameters'
           ,'Groq'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,2
           ,1
           ,'GroqLLM'
           ,NULL
           ,'llama-3.1-8b-instant'
           ,getdate()	
           ,getdate()
           ,NULL
           ,NULL)

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
           ,[CostRank])
     VALUES
           ('5d218bcf-b7f6-439e-97fd-dc3a79432562'
           ,'Claude 3.5 Sonnet'
           ,'First model of the Claude 3.5 model family'
           ,'Anthropic'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,5
           ,1
           ,'AnthropicLLM'
           ,NULL
           ,'claude-3-5-sonnet-20240620'
           ,getdate()	
           ,getdate()
           ,NULL
           ,NULL)

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
           ,[CostRank])
     VALUES
           ('0ae8548e-30a6-4fbc-8f69-6344d0cbaf2d'
           ,'GPT 4o Mini'
           ,'Affordable and intelligent small model for fast, lightweight tasks. GPT-4o mini is cheaper and more capable than GPT-3.5 Turbo'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,4
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'gpt-4o-mini'
           ,getdate()	
           ,getdate()
           ,NULL
           ,NULL)