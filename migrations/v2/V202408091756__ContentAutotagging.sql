/****************************************************************************************
Content Autotagging Schema and Tables
****************************************************************************************/


/****** Object:  Schema [  Content_Autotagging]    Script Date: 8/9/2024 5:55:22 PM ******/
CREATE SCHEMA [  Content_Autotagging]
GO
/****** Object:  Table [  Content_Autotagging].[ContentFileType]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentFileType](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](255) NOT NULL,
	[FileExtension] [nvarchar](255) NULL,
	[CreatedAt] [datetimeoffset](7) NOT NULL,
	[UpdateAt] [datetimeoffset](7) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentFileType] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentItem]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentItem](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[ContentSourceID] [int] NOT NULL,
	[Name] [nvarchar](250) NULL,
	[Description] [nvarchar](max) NULL,
	[ContentTypeID] [int] NOT NULL,
	[ContentSourceTypeID] [int] NOT NULL,
	[ContentFileTypeID] [int] NOT NULL,
	[Checksum] [nvarchar](100) NULL,
	[URL] [nvarchar](2000) NOT NULL,
	[Text] [nvarchar](max) NULL,
	[CreatedAt] [datetimeoffset](7) NOT NULL,
	[UpdatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentItem_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentItemAttribute]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentItemAttribute](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[ContentItemID] [int] NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Value] [nvarchar](max) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentItemAttribute_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentItemTag]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentItemTag](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[ItemID] [int] NOT NULL,
	[Tag] [nvarchar](200) NOT NULL,
	[CreatedAt] [datetimeoffset](7) NOT NULL,
	[UpdatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentItemTag_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentProcessRun]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentProcessRun](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[SourceID] [int] NOT NULL,
	[StartTime] [datetime] NULL,
	[EndTime] [datetime] NULL,
	[Status] [nvarchar](100) NULL,
	[ProcessedItems] [int] NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentProcessRun_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentSource]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentSource](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](255) NULL,
	[ContentTypeID] [int] NOT NULL,
	[ContentSourceTypeID] [int] NOT NULL,
	[ContentFileTypeID] [int] NOT NULL,
	[URL] [nvarchar](2000) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSource_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentSourceParam]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentSourceParam](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[ContentSourceID] [int] NOT NULL,
	[ContentSourceTypeParamID] [int] NOT NULL,
	[Value] [nvarchar](max) NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSourceParam_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentSourceType]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentSourceType](
	[ID] [int] IDENTITY(1,1) NOT NULL,
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
/****** Object:  Table [  Content_Autotagging].[ContentSourceTypeParam]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentSourceTypeParam](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Description] [nvarchar](max) NULL,
	[Type] [nvarchar](50) NULL,
	[DefaultValue] [nvarchar](max) NULL,
	[IsRequired] [bit] NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentSourceTypeParam_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentType]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentType](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](255) NOT NULL,
	[Description] [nvarchar](max) NULL,
	[AIModelID] [uniqueidentifier] NOT NULL,
	[MinTags] [int] NOT NULL,
	[MaxTags] [int] NOT NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentType_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [  Content_Autotagging].[ContentTypeAttribute]    Script Date: 8/9/2024 5:55:22 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [  Content_Autotagging].[ContentTypeAttribute](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[ContentTypeID] [int] NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Prompt] [nvarchar](max) NOT NULL,
	[Description] [nvarchar](max) NULL,
	[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,
	[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,
 CONSTRAINT [PK_ContentTypeAttribute_1] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [  Content_Autotagging].[ContentFileType] ADD  CONSTRAINT [DF__ContentFi____mj___799DF262]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentFileType] ADD  CONSTRAINT [DF__ContentFi____mj___7A92169B]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentItem] ADD  CONSTRAINT [DF__ContentIt____mj___7B863AD4]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentItem] ADD  CONSTRAINT [DF__ContentIt____mj___7C7A5F0D]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentItemAttribute] ADD  CONSTRAINT [DF__ContentIt____mj___7D6E8346]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentItemAttribute] ADD  CONSTRAINT [DF__ContentIt____mj___7E62A77F]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentItemTag] ADD  CONSTRAINT [DF__ContentIt____mj___11757BF3]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentItemTag] ADD  CONSTRAINT [DF__ContentIt____mj___1269A02C]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentProcessRun] ADD  CONSTRAINT [DF__ContentPr____mj___7F56CBB8]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentProcessRun] ADD  CONSTRAINT [DF__ContentPr____mj___004AEFF1]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSource] ADD  CONSTRAINT [DF__ContentSo____mj___013F142A]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSource] ADD  CONSTRAINT [DF__ContentSo____mj___02333863]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceParam] ADD  CONSTRAINT [DF__ContentSo____mj___03275C9C]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceParam] ADD  CONSTRAINT [DF__ContentSo____mj___041B80D5]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceType] ADD  CONSTRAINT [DF__ContentSo____mj___0AC87E64]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceType] ADD  CONSTRAINT [DF__ContentSo____mj___0BBCA29D]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceTypeParam] ADD  CONSTRAINT [DF__ContentSo____mj___050FA50E]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceTypeParam] ADD  CONSTRAINT [DF__ContentSo____mj___0603C947]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentType] ADD  CONSTRAINT [DF__ContentTy____mj___06F7ED80]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentType] ADD  CONSTRAINT [DF__ContentTy____mj___07EC11B9]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentTypeAttribute] ADD  CONSTRAINT [DF__ContentTy____mj___08E035F2]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
GO
ALTER TABLE [  Content_Autotagging].[ContentTypeAttribute] ADD  CONSTRAINT [DF__ContentTy____mj___09D45A2B]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
GO
ALTER TABLE [__mj].[AIModel]  WITH CHECK ADD  CONSTRAINT [FK_AIModel_AIModelType] FOREIGN KEY([AIModelTypeID])
REFERENCES [__mj].[AIModelType] ([ID])
GO
ALTER TABLE [__mj].[AIModel] CHECK CONSTRAINT [FK_AIModel_AIModelType]
GO
ALTER TABLE [  Content_Autotagging].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentFileTypeID] FOREIGN KEY([ContentFileTypeID])
REFERENCES [  Content_Autotagging].[ContentFileType] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentFileTypeID]
GO
ALTER TABLE [  Content_Autotagging].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentSourceID] FOREIGN KEY([ContentSourceID])
REFERENCES [  Content_Autotagging].[ContentSource] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentSourceID]
GO
ALTER TABLE [  Content_Autotagging].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentSourceTypeID] FOREIGN KEY([ContentSourceTypeID])
REFERENCES [  Content_Autotagging].[ContentSourceType] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentSourceTypeID]
GO
ALTER TABLE [  Content_Autotagging].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentTypeID] FOREIGN KEY([ContentTypeID])
REFERENCES [  Content_Autotagging].[ContentType] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentTypeID]
GO
ALTER TABLE [  Content_Autotagging].[ContentItemAttribute]  WITH CHECK ADD  CONSTRAINT [FK_ContentItemAttribute_ContentItemID] FOREIGN KEY([ContentItemID])
REFERENCES [  Content_Autotagging].[ContentItem] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentItemAttribute] CHECK CONSTRAINT [FK_ContentItemAttribute_ContentItemID]
GO
ALTER TABLE [  Content_Autotagging].[ContentItemTag]  WITH CHECK ADD  CONSTRAINT [FK_ContentItemTag_ContentItemID] FOREIGN KEY([ItemID])
REFERENCES [  Content_Autotagging].[ContentItem] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentItemTag] CHECK CONSTRAINT [FK_ContentItemTag_ContentItemID]
GO
ALTER TABLE [  Content_Autotagging].[ContentProcessRun]  WITH CHECK ADD  CONSTRAINT [FK_ContentProcessRun_ContentSourceID] FOREIGN KEY([SourceID])
REFERENCES [  Content_Autotagging].[ContentSource] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentProcessRun] CHECK CONSTRAINT [FK_ContentProcessRun_ContentSourceID]
GO
ALTER TABLE [  Content_Autotagging].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentFileTypeID] FOREIGN KEY([ContentFileTypeID])
REFERENCES [  Content_Autotagging].[ContentFileType] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentFileTypeID]
GO
ALTER TABLE [  Content_Autotagging].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentSourceTypeID] FOREIGN KEY([ContentSourceTypeID])
REFERENCES [  Content_Autotagging].[ContentSourceType] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentSourceTypeID]
GO
ALTER TABLE [  Content_Autotagging].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentTypeID] FOREIGN KEY([ContentTypeID])
REFERENCES [  Content_Autotagging].[ContentType] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentTypeID]
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceParam]  WITH CHECK ADD  CONSTRAINT [FK_ContentSourceParam_ContentSourceID] FOREIGN KEY([ContentSourceID])
REFERENCES [  Content_Autotagging].[ContentSource] ([ID])
GO
ALTER TABLE [  Content_Autotagging].[ContentSourceParam] CHECK CONSTRAINT [FK_ContentSourceParam_ContentSourceID]
GO
ALTER TABLE [  Content_Autotagging].[ContentType]  WITH CHECK ADD  CONSTRAINT [FK_AIModel_mj_AIModel] FOREIGN KEY([AIModelID])
REFERENCES [__mj].[AIModel] ([ID])
GO

/****************************************************************************************
AI Models Table Additions
****************************************************************************************/
INSERT INTO [__mj].[AIModel]
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

INSERT INTO [__mj].[AIModel]
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

INSERT INTO [__mj].[AIModel]
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

INSERT INTO [__mj].[AIModel]
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

INSERT INTO [__mj].[AIModel]
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