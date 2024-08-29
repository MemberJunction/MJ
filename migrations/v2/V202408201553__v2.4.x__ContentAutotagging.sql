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
           ([Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[SpeedRank]
           ,[CostRank])
     VALUES
           ('Llama 3.1 405b'
           ,'Llama 3.1 405 billion parameters'
           ,'Groq'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,5
           ,1
           ,'GroqLLM'
           ,NULL
           ,'llama-3.1-405b-reasoning'
           ,NULL
           ,NULL)

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[SpeedRank]
           ,[CostRank])
     VALUES
           ('Llama 3.1 70b'
           ,'Llama 3.1 70 billion parameters'
           ,'Groq'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,4
           ,1
           ,'GroqLLM'
           ,NULL
           ,'llama-3.1-70b-versatile'
           ,NULL
           ,NULL)

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[SpeedRank]
           ,[CostRank])
     VALUES
           ('Llama 3.1 8b'
           ,'Llama 3.1 8 billion parameters'
           ,'Groq'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,2
           ,1
           ,'GroqLLM'
           ,NULL
           ,'llama-3.1-8b-instant'
           ,NULL
           ,NULL)

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[SpeedRank]
           ,[CostRank])
     VALUES
           ('Claude 3.5 Sonnet'
           ,'First model of the Claude 3.5 model family'
           ,'Anthropic'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,5
           ,1
           ,'AnthropicLLM'
           ,NULL
           ,'claude-3-5-sonnet-20240620'
           ,NULL
           ,NULL)

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[SpeedRank]
           ,[CostRank])
     VALUES
           ('GPT 4o Mini'
           ,'Affordable and intelligent small model for fast, lightweight tasks. GPT-4o mini is cheaper and more capable than GPT-3.5 Turbo'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,4
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'gpt-4o-mini'
           ,NULL
           ,NULL)

  update [${flyway:defaultSchema}].[AIModel]
  Set APIName='open-mistral-8x7b'
  where ID='E2A5CCEC-6A37-EF11-86D4-000D3A4E707E'


/****************************************************************************************
Generated SQL From CodeGen for New Entities
****************************************************************************************/

    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Process Runs', 
         NULL,
         NULL,
         'ContentProcessRun', 
         'vwContentProcessRuns', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Sources', 
         NULL,
         NULL,
         'ContentSource', 
         'vwContentSources', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Source Params', 
         NULL,
         NULL,
         'ContentSourceParam', 
         'vwContentSourceParams', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Source Types', 
         NULL,
         NULL,
         'ContentSourceType', 
         'vwContentSourceTypes', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Source Type Params', 
         NULL,
         NULL,
         'ContentSourceTypeParam', 
         'vwContentSourceTypeParams', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Types', 
         NULL,
         NULL,
         'ContentType', 
         'vwContentTypes', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Type Attributes', 
         NULL,
         NULL,
         'ContentTypeAttribute', 
         'vwContentTypeAttributes', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content File Types', 
         NULL,
         NULL,
         'ContentFileType', 
         'vwContentFileTypes', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Items', 
         NULL,
         NULL,
         'ContentItem', 
         'vwContentItems', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Item Attributes', 
         NULL,
         NULL,
         'ContentItemAttribute', 
         'vwContentItemAttributes', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
      DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
      INSERT INTO [${flyway:defaultSchema}].Entity (
         Name, 
         Description,
         NameSuffix,
         BaseTable, 
         BaseView, 
         SchemaName, 
         IncludeInAPI, 
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      ) 
      OUTPUT INSERTED.[ID] INTO @InsertedRow
      VALUES (
         'Content Item Tags', 
         NULL,
         NULL,
         'ContentItemTag', 
         'vwContentItemTags', 
         '__mj',
         1, 
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
      SELECT * FROM [${flyway:defaultSchema}].vwEntities WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
   INSERT INTO __mj.ApplicationEntity 
                                                            (ApplicationID, EntityID, Sequence) VALUES 
                                                            ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)INSERT INTO __mj.EntityPermission 
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                   ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'SourceID',
         'Source ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'StartTime',
         'Start Time',
         NULL,
         'datetime',
         8,
         23,
         3,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'EndTime',
         'End Time',
         NULL,
         'datetime',
         8,
         23,
         3,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         'Status',
         'Status',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'ProcessedItems',
         'Processed Items',
         NULL,
         'int',
         4,
         10,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         8,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'ContentTypeID',
         'Content Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'ContentSourceTypeID',
         'Content Source Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         'ContentFileTypeID',
         'Content File Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'URL',
         'URL',
         NULL,
         'nvarchar',
         4000,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         8,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'ContentSourceID',
         'Content Source ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'ContentSourceTypeParamID',
         'Content Source Type Param ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'Value',
         'Value',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Description',
         'Description',
         NULL,
         'nvarchar',
         2000,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Description',
         'Description',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'Type',
         'Type',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         'DefaultValue',
         'Default Value',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'IsRequired',
         'Is Required',
         NULL,
         'bit',
         1,
         1,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         8,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Description',
         'Description',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'AIModelID',
         'AIModel ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'FD238F34-2837-EF11-86D4-6045BDEE16E6',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         'MinTags',
         'Min Tags',
         NULL,
         'int',
         4,
         10,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'MaxTags',
         'Max Tags',
         NULL,
         'int',
         4,
         10,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         8,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'ContentTypeID',
         'Content Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'Prompt',
         'Prompt',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         'Description',
         'Description',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'FileExtension',
         'File Extension',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'ContentSourceID',
         'Content Source ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         500,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'Description',
         'Description',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         'ContentTypeID',
         'Content Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'ContentSourceTypeID',
         'Content Source Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         'ContentFileTypeID',
         'Content File Type ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B193AD50-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         8,
         'Checksum',
         'Checksum',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'URL',
         'URL',
         NULL,
         'nvarchar',
         4000,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         10,
         'Text',
         'Text',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         11,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         12,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'ContentItemID',
         'Content Item ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Name',
         'Name',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         1,
         1,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         'Value',
         'Value',
         NULL,
         'nvarchar',
         -1,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         1,
         'ID',
         'ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         2,
         'ItemID',
         'Item ID',
         NULL,
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         'ID',
         0,
         0,
         1,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         3,
         'Tag',
         'Tag',
         NULL,
         'nvarchar',
         400,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         4,
         '__mj_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         5,
         '__mj_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
         0,
         0,
         'Search'
      )UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='42DE5E8E-A83B-EF11-86D4-0022481D1B23'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3FDE5E8E-A83B-EF11-86D4-0022481D1B23'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='270644A9-0A3C-EF11-86D4-0022481D1B23'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='609DD1AA-0D66-EF11-A752-C0A5E8ACCB22'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6E9DD1AA-0D66-EF11-A752-C0A5E8ACCB22'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B04C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='055817F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F64217F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C64D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C64D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='115917F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F75817F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='334D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='304D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F4D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='614D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C34217F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='819DD1AA-0D66-EF11-A752-C0A5E8ACCB22'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D44217F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='144F17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B85717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B24D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B75717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E74217F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F04217F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D94D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D74D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='DC4D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F34D17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='124E17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='524317F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='544317F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5C4317F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='734E17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E54317F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F74317F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='EE4E17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1D4F17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1B4F17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2E4417F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3F4F17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F4417F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='384F17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B4F17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='384417F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B4417F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='505717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7A4C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='545717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='595717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F95817F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5E5717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='964C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A24C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A34C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A34C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='755717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B44C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='805717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='815717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='875717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BA4C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BC4C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9C5717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FC5817F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A55717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F74C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FD4C17F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F65717F0-6F36-EF11-86D4-6045BDEE16E6'UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='995817F0-6F36-EF11-86D4-6045BDEE16E6'INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('FD238F34-2837-EF11-86D4-6045BDEE16E6', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'AIModelID', 'One To Many', 1, 1, 'Content Types', 1);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'SourceID', 'One To Many', 1, 1, 'Content Process Runs', 1);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceID', 'One To Many', 1, 1, 'Content Source Params', 1);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceID', 'One To Many', 1, 1, 'Content Items', 1);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceTypeID', 'One To Many', 1, 1, 'Content Items', 2);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceTypeID', 'One To Many', 1, 1, 'Content Sources', 1);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ContentTypeID', 'One To Many', 1, 1, 'Content Sources', 2);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentTypeID', 'One To Many', 1, 1, 'Content Items', 3);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentFileTypeID', 'One To Many', 1, 1, 'Content Items', 4);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ContentFileTypeID', 'One To Many', 1, 1, 'Content Sources', 3);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'ContentItemID', 'One To Many', 1, 1, 'Content Item Attributes', 1);
                              INSERT INTO __mj.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                          VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'ItemID', 'One To Many', 1, 1, 'Content Item Tags', 1);
                              EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='E563E99C-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='Source'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='2DF0ECAD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentSource'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='EE63E99C-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentType'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='4628C3B7-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='AIModel'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='EF63E99C-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentSourceType'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='F063E99C-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentFileType'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='18D4D1BD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentSource'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='24D4D1BD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentItem'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='2AD4D1BD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='Item'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='1BD4D1BD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentType'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='1CD4D1BD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentSourceType'EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap 
         @EntityFieldID='1DD4D1BD-0E66-EF11-A752-C0A5E8ACCB22',
         @RelatedEntityNameFieldMap='ContentFileType'EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'Source',
         'Source',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'ContentType',
         'Content Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         10,
         'ContentSourceType',
         'Content Source Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         11,
         'ContentFileType',
         'Content File Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         'ContentSource',
         'Content Source',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'AIModel',
         'AIModel',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         13,
         'ContentSource',
         'Content Source',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         14,
         'ContentType',
         'Content Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         15,
         'ContentSourceType',
         'Content Source Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         16,
         'ContentFileType',
         'Content File Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         'ContentItem',
         'Content Item',
         NULL,
         'nvarchar',
         500,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'Item',
         'Item',
         NULL,
         'nvarchar',
         500,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )