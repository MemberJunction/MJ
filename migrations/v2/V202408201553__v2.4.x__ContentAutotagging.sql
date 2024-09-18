/****************************************************************************************
Content Autotagging Tables
****************************************************************************************/
CREATE TABLE [${flyway:defaultSchema}].[ContentFileType]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[Name] [nvarchar](255) NOT NULL,[FileExtension] [nvarchar](255) NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentFileType] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentItem]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[ContentSourceID] [uniqueidentifier] NOT NULL,[Name] [nvarchar](250) NULL,[Description] [nvarchar](max) NULL,[ContentTypeID] [uniqueidentifier] NOT NULL,[ContentSourceTypeID] [uniqueidentifier] NOT NULL,[ContentFileTypeID] [uniqueidentifier] NOT NULL,[Checksum] [nvarchar](100) NULL,[URL] [nvarchar](2000) NOT NULL,[Text] [nvarchar](max) NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentItem] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentItemAttribute]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[ContentItemID] [uniqueidentifier] NOT NULL,[Name] [nvarchar](100) NOT NULL,[Value] [nvarchar](max) NOT NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentItemAttribute] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentItemTag]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[ItemID] [uniqueidentifier] NOT NULL,[Tag] [nvarchar](200) NOT NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentItemTag] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentProcessRun]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[SourceID] [uniqueidentifier] NOT NULL,[StartTime] [datetime] NULL,[EndTime] [datetime] NULL,[Status] [nvarchar](100) NULL,[ProcessedItems] [int] NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentProcessRun] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentSource]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[Name] [nvarchar](255) NULL,[ContentTypeID] [uniqueidentifier] NOT NULL,[ContentSourceTypeID] [uniqueidentifier] NOT NULL,[ContentFileTypeID] [uniqueidentifier] NOT NULL,[URL] [nvarchar](2000) NOT NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentSource] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentSourceParam]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[ContentSourceID] [uniqueidentifier] NOT NULL,[ContentSourceTypeParamID] [uniqueidentifier] NOT NULL,[Value] [nvarchar](max) NOT NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentSourceParam] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentSourceType]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[Name] [nvarchar](255) NOT NULL,[Description] [nvarchar](1000) NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentSourceType] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentSourceTypeParam]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[Name] [nvarchar](100) NOT NULL,[Description] [nvarchar](max) NULL,[Type] [nvarchar](50) NULL,[DefaultValue] [nvarchar](max) NULL,[IsRequired] [bit] NOT NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentSourceTypeParam] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentType]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[Name] [nvarchar](255) NOT NULL,[Description] [nvarchar](max) NULL,[AIModelID] [uniqueidentifier] NOT NULL,[MinTags] [int] NOT NULL,[MaxTags] [int] NOT NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentType] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
CREATE TABLE [${flyway:defaultSchema}].[ContentTypeAttribute]([ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),[ContentTypeID] [uniqueidentifier] NOT NULL,[Name] [nvarchar](100) NOT NULL,[Prompt] [nvarchar](max) NOT NULL,[Description] [nvarchar](max) NULL,[__mj_CreatedAt] [datetimeoffset](7) NOT NULL,[__mj_UpdatedAt] [datetimeoffset](7) NOT NULL,CONSTRAINT [PK_ContentTypeAttribute] PRIMARY KEY CLUSTERED ([ID] ASC)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];

ALTER TABLE [${flyway:defaultSchema}].[ContentFileType] ADD  CONSTRAINT [DF__ContentFi____mj___799DF262]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentFileType] ADD  CONSTRAINT [DF__ContentFi____mj___7A92169B]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] ADD  CONSTRAINT [DF__ContentIt____mj___7B863AD4]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] ADD  CONSTRAINT [DF__ContentIt____mj___7C7A5F0D]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute] ADD  CONSTRAINT [DF__ContentIt____mj___7D6E8346]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute] ADD  CONSTRAINT [DF__ContentIt____mj___7E62A77F]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag] ADD  CONSTRAINT [DF__ContentIt____mj___11757BF3]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag] ADD  CONSTRAINT [DF__ContentIt____mj___1269A02C]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] ADD  CONSTRAINT [DF__ContentPr____mj___7F56CBB8]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] ADD  CONSTRAINT [DF__ContentPr____mj___004AEFF1]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] ADD  CONSTRAINT [DF__ContentSo____mj___013F142A]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] ADD  CONSTRAINT [DF__ContentSo____mj___02333863]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam] ADD  CONSTRAINT [DF__ContentSo____mj___03275C9C]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam] ADD  CONSTRAINT [DF__ContentSo____mj___041B80D5]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceType] ADD  CONSTRAINT [DF__ContentSo____mj___0AC87E64]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceType] ADD  CONSTRAINT [DF__ContentSo____mj___0BBCA29D]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceTypeParam] ADD  CONSTRAINT [DF__ContentSo____mj___050FA50E]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceTypeParam] ADD  CONSTRAINT [DF__ContentSo____mj___0603C947]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentType] ADD  CONSTRAINT [DF__ContentTy____mj___06F7ED80]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentType] ADD  CONSTRAINT [DF__ContentTy____mj___07EC11B9]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentTypeAttribute] ADD  CONSTRAINT [DF__ContentTy____mj___08E035F2]  DEFAULT (getutcdate()) FOR [__mj_CreatedAt]
ALTER TABLE [${flyway:defaultSchema}].[ContentTypeAttribute] ADD  CONSTRAINT [DF__ContentTy____mj___09D45A2B]  DEFAULT (getutcdate()) FOR [__mj_UpdatedAt]

ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentFileTypeID] FOREIGN KEY([ContentFileTypeID]) REFERENCES [${flyway:defaultSchema}].[ContentFileType] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentFileTypeID]
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentSourceID] FOREIGN KEY([ContentSourceID]) REFERENCES [${flyway:defaultSchema}].[ContentSource] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentSourceID]
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentSourceTypeID] FOREIGN KEY([ContentSourceTypeID]) REFERENCES [${flyway:defaultSchema}].[ContentSourceType] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentSourceTypeID]
ALTER TABLE [${flyway:defaultSchema}].[ContentItem]  WITH CHECK ADD  CONSTRAINT [FK_ContentItem_ContentTypeID] FOREIGN KEY([ContentTypeID]) REFERENCES [${flyway:defaultSchema}].[ContentType] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentItem] CHECK CONSTRAINT [FK_ContentItem_ContentTypeID]
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute]  WITH CHECK ADD  CONSTRAINT [FK_ContentItemAttribute_ContentItemID] FOREIGN KEY([ContentItemID]) REFERENCES [${flyway:defaultSchema}].[ContentItem] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentItemAttribute] CHECK CONSTRAINT [FK_ContentItemAttribute_ContentItemID]
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag]  WITH CHECK ADD  CONSTRAINT [FK_ContentItemTag_ContentItemID] FOREIGN KEY([ItemID]) REFERENCES [${flyway:defaultSchema}].[ContentItem] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentItemTag] CHECK CONSTRAINT [FK_ContentItemTag_ContentItemID]
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun]  WITH CHECK ADD  CONSTRAINT [FK_ContentProcessRun_ContentSourceID] FOREIGN KEY([SourceID]) REFERENCES [${flyway:defaultSchema}].[ContentSource] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] CHECK CONSTRAINT [FK_ContentProcessRun_ContentSourceID]
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentFileTypeID] FOREIGN KEY([ContentFileTypeID]) REFERENCES [${flyway:defaultSchema}].[ContentFileType] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentFileTypeID]
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentSourceTypeID] FOREIGN KEY([ContentSourceTypeID]) REFERENCES [${flyway:defaultSchema}].[ContentSourceType] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentSourceTypeID]
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]  WITH CHECK ADD  CONSTRAINT [FK_ContentSource_ContentTypeID] FOREIGN KEY([ContentTypeID]) REFERENCES [${flyway:defaultSchema}].[ContentType] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentSource] CHECK CONSTRAINT [FK_ContentSource_ContentTypeID]
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam]  WITH CHECK ADD  CONSTRAINT [FK_ContentSourceParam_ContentSourceID] FOREIGN KEY([ContentSourceID]) REFERENCES [${flyway:defaultSchema}].[ContentSource] ([ID])
ALTER TABLE [${flyway:defaultSchema}].[ContentSourceParam] CHECK CONSTRAINT [FK_ContentSourceParam_ContentSourceID]
ALTER TABLE [${flyway:defaultSchema}].[ContentType]  WITH CHECK ADD  CONSTRAINT [FK_AIModel_mj_AIModel] FOREIGN KEY([AIModelID]) REFERENCES [${flyway:defaultSchema}].[AIModel] ([ID])


/****************************************************************************************
AI Models Table Additions
****************************************************************************************/
-- Add InputTokenLimit to AIModel table
ALTER TABLE [${flyway:defaultSchema}].[AIModel] ADD InputTokenLimit INT NULL;

-- Add MS_Description for the new InputTokenLimit column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Stores the maximum number of tokens that fit in the context window for the model.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'AIModel', 
    @level2type = N'Column', @level2name = 'InputTokenLimit';

/****************************************************************************************
Generated SQL From CodeGen for New Entities
****************************************************************************************/

INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI, TrackRecordChanges, AuditRecordAccess, AuditViewRuns, AllowAllRowsAPI, AllowCreateAPI, AllowUpdateAPI, AllowDeleteAPI, UserViewMaxRows) VALUES ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'Content Process Runs', NULL, NULL,'ContentProcessRun', 'vwContentProcessRuns', '${flyway:defaultSchema}',1, 0, 0, 0, 0, 0, 1, 1, 1, 1000)
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)    
INSERT INTO [${flyway:defaultSchema}].Entity ( ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'Content Sources', NULL, NULL, 'ContentSource', 'vwContentSources', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 )
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E')) 
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0) 
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0) 
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1) 
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'Content Source Params', NULL, NULL, 'ContentSourceParam', 'vwContentSourceParams', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1) 
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'Content Source Types', NULL, NULL, 'ContentSourceType', 'vwContentSourceTypes', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'Content Source Type Params', NULL, NULL, 'ContentSourceTypeParam', 'vwContentSourceTypeParams', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'Content Types', NULL, NULL, 'ContentType', 'vwContentTypes', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'Content Type Attributes', NULL, NULL, 'ContentTypeAttribute', 'vwContentTypeAttributes', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'Content File Types', NULL, NULL, 'ContentFileType', 'vwContentFileTypes', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'Content Items', NULL, NULL, 'ContentItem', 'vwContentItems', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'Content Item Attributes', NULL, NULL, 'ContentItemAttribute', 'vwContentItemAttributes', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)
INSERT INTO [${flyway:defaultSchema}].Entity (ID, Name, Description, NameSuffix, BaseTable, BaseView, SchemaName, IncludeInAPI, AllowUserSearchAPI , TrackRecordChanges , AuditRecordAccess , AuditViewRuns , AllowAllRowsAPI , AllowCreateAPI , AllowUpdateAPI , AllowDeleteAPI , UserViewMaxRows ) VALUES ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'Content Item Tags', NULL, NULL, 'ContentItemTag', 'vwContentItemTags', '${flyway:defaultSchema}', 1, 0 , 0 , 0 , 0 , 0 , 1 , 1 , 1 , 1000 ) 
INSERT INTO [${flyway:defaultSchema}].ApplicationEntity (ApplicationID, EntityID, Sequence) VALUES ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', (SELECT ISNULL(MAX(Sequence),0)+1 FROM [${flyway:defaultSchema}].ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)
INSERT INTO [${flyway:defaultSchema}].EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES ('F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging' 

INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 2, 'SourceID', 'Source ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 3, 'StartTime', 'Start Time', NULL, 'datetime', 8, 23, 3, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 4, 'EndTime', 'End Time', NULL, 'datetime', 8, 23, 3, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 5, 'Status', 'Status', NULL, 'nvarchar', 200, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 6, 'ProcessedItems', 'Processed Items', NULL, 'int', 4, 10, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 7, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 8, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 3, 'ContentTypeID', 'Content Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 4, 'ContentSourceTypeID', 'Content Source Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 5, 'ContentFileTypeID', 'Content File Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 6, 'URL', 'URL', NULL, 'nvarchar', 4000, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 7, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 8, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentSourceID', 'Content Source ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 3, 'ContentSourceTypeParamID', 'Content Source Type Param ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Value', 'Value', NULL, 'nvarchar', -1, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 5, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 6, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Description', 'Description', NULL, 'nvarchar', 2000, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 4, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 5, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Type', 'Type', NULL, 'nvarchar', 100, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 5, 'DefaultValue', 'Default Value', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 6, 'IsRequired', 'Is Required', NULL, 'bit', 1, 1, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 7, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 8, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, 'AIModelID', 'AIModel ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, 'MinTags', 'Min Tags', NULL, 'int', 4, 10, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 6, 'MaxTags', 'Max Tags', NULL, 'int', 4, 10, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 7, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 8, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentTypeID', 'Content Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Name', 'Name', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Prompt', 'Prompt', NULL, 'nvarchar', -1, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 6, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 7, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'FileExtension', 'File Extension', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentSourceID', 'Content Source ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Name', 'Name', NULL, 'nvarchar', 500, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, 'ContentTypeID', 'Content Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 6, 'ContentSourceTypeID', 'Content Source Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 7, 'ContentFileTypeID', 'Content File Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 8, 'Checksum', 'Checksum', NULL, 'nvarchar', 200, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 9, 'URL', 'URL', NULL, 'nvarchar', 4000, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 10, 'Text', 'Text', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 11, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 12, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentItemID', 'Content Item ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Name', 'Name', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Value', 'Value', NULL, 'nvarchar', -1, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 5, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 6, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ItemID', 'Item ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Tag', 'Tag', NULL, 'nvarchar', 400, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 4, '${flyway:defaultSchema}_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' ) 
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 5, '${flyway:defaultSchema}_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )


UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='42DE5E8E-A83B-EF11-86D4-0022481D1B23'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3FDE5E8E-A83B-EF11-86D4-0022481D1B23'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='270644A9-0A3C-EF11-86D4-0022481D1B23'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='609DD1AA-0D66-EF11-A752-C0A5E8ACCB22'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6E9DD1AA-0D66-EF11-A752-C0A5E8ACCB22'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B04C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='055817F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F64217F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C64D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C64D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='115917F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F75817F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='334D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='304D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='614D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C34217F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='819DD1AA-0D66-EF11-A752-C0A5E8ACCB22'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D44217F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='144F17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B85717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B75717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E74217F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F04217F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D94D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D74D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='DC4D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F34D17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='124E17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='524317F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='544317F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='734E17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E54317F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F74317F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='EE4E17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2E4417F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F4417F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='384F17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='384417F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='505717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7A4C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='545717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='595717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F95817F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='964C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A24C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A34C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A34C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='755717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B44C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='805717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='815717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='875717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FC5817F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A55717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F74C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FD4C17F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F65717F0-6F36-EF11-86D4-6045BDEE16E6'
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='995817F0-6F36-EF11-86D4-6045BDEE16E6'

INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('FD238F34-2837-EF11-86D4-6045BDEE16E6', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'AIModelID', 'One To Many', 1, 1, 'Content Types', 1); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'SourceID', 'One To Many', 1, 1, 'Content Process Runs', 1); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceID', 'One To Many', 1, 1, 'Content Source Params', 1); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceID', 'One To Many', 1, 1, 'Content Items', 1); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceTypeID', 'One To Many', 1, 1, 'Content Items', 2); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ContentSourceTypeID', 'One To Many', 1, 1, 'Content Sources', 1); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ContentTypeID', 'One To Many', 1, 1, 'Content Sources', 2); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentTypeID', 'One To Many', 1, 1, 'Content Items', 3); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ContentFileTypeID', 'One To Many', 1, 1, 'Content Items', 4); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ContentFileTypeID', 'One To Many', 1, 1, 'Content Sources', 3); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 'ContentItemID', 'One To Many', 1, 1, 'Content Item Attributes', 1); 
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'ItemID', 'One To Many', 1, 1, 'Content Item Tags', 1); 

EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='E563E99C-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='Source'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='2DF0ECAD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentSource'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='EE63E99C-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentType'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='4628C3B7-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='AIModel'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='EF63E99C-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentSourceType'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='F063E99C-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentFileType'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='18D4D1BD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentSource'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='24D4D1BD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentItem'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='2AD4D1BD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='Item'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='1BD4D1BD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentType'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='1CD4D1BD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentSourceType'
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID='1DD4D1BD-0E66-EF11-A752-C0A5E8ACCB22', @RelatedEntityNameFieldMap='ContentFileType'
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging' 

--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 9, 'Source', 'Source', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 9, 'ContentType', 'Content Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 10, 'ContentSourceType', 'Content Source Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 11, 'ContentFileType', 'Content File Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
-- INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 7, 'ContentSource', 'Content Source', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
-- INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 9, 'AIModel', 'AIModel', NULL, 'nvarchar', 100, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 13, 'ContentSource', 'Content Source', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 14, 'ContentType', 'Content Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 15, 'ContentSourceType', 'Content Source Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 16, 'ContentFileType', 'Content File Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 7, 'ContentItem', 'Content Item', NULL, 'nvarchar', 500, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' ) 
--INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 6, 'Item', 'Item', NULL, 'nvarchar', 500, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )

INSERT INTO [${flyway:defaultSchema}].ContentFileType ( Name, FileExtension ) VALUES ( 'PDF', '.pdf' )
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( Name, FileExtension ) VALUES ( 'DOCX', '.docx' )
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( Name, FileExtension ) VALUES ( 'XML', '.xml' )
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( Name, FileExtension ) VALUES ( 'HTML', '.html' )

INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( Name, Description ) VALUES ( 'Local File System', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( Name, Description ) VALUES ( 'Website', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( Name, Description ) VALUES ( 'RSS Feed', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( Name, Description ) VALUES ( 'Cloud Storage', NULL )

INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (Name, Description, Type, DefaultValue, IsRequired ) VALUES ('CrawlOtherSitesInTopLevelDomain', 'Dictates whether we crawl links from a website at the same domain level as the link provided.', 'Boolean', 'false', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (Name, Description, Type, DefaultValue, IsRequired ) VALUES ('CrawlSitesInLowerLevelDomain', 'Dictates whether we crawl sites that are in lower level domains from the starting URL.', 'Boolean', 'false', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (Name, Description, Type, DefaultValue, IsRequired ) VALUES ('MaxDepth', 'Specifies the maximum depth that we crawl the site.', 'Number', '0', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (Name, Description, Type, DefaultValue, IsRequired ) VALUES ('RootURL', 'Optional parameter to specify what form any scraped links must start with, and defaults to the homepage of the website.', 'String', Null, 0)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (Name, Description, Type, DefaultValue, IsRequired ) VALUES ('URLPattern', 'Optional parameter for the Webcrawler that defines a regular expression pattern that the URL must match when extracting links on a page. The default is a regular expression that allows for any link.', 'RegExp', '^.*$', 0)

DROP PROCEDURE IF EXISTS [__mj].[spCreateContentFileType]
GO

CREATE PROCEDURE [__mj].[spCreateContentFileType]
    @Name nvarchar(255),
    @FileExtension nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentFileType]
        (
            [Name],
            [FileExtension],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @FileExtension, 
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentFileTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentFileType] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentItem]
GO

CREATE PROCEDURE [__mj].[spCreateContentItem]
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentItem]
        (
            [ContentSourceID],
            [Name],
            [Description],
            [ContentTypeID],
            [ContentSourceTypeID],
            [ContentFileTypeID],
            [Checksum],
            [URL],
            [Text],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ContentSourceID,
            @Name,
            @Description,
            @ContentTypeID,
            @ContentSourceTypeID,
            @ContentFileTypeID,
            @Checksum,
            @URL,
            @Text, 
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentItemAttribute]
GO

CREATE PROCEDURE [__mj].[spCreateContentItemAttribute]
    @ContentItemID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentItemAttribute]
        (
            [ContentItemID],
            [Name],
            [Value],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ContentItemID,
            @Name,
            @Value, 
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentItemAttributes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentItemAttribute] TO [cdp_Developer], [cdp_Integration]
    

DROP PROCEDURE IF EXISTS [__mj].[spCreateContentItemTag]
GO

CREATE PROCEDURE [__mj].[spCreateContentItemTag]
    @ItemID uniqueidentifier,
    @Tag nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentItemTag]
        (
            [ItemID],
            [Tag],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ItemID,
            @Tag,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentItemTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentItemTag] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentProcessRun]
GO

CREATE PROCEDURE [__mj].[spCreateContentProcessRun]
    @SourceID uniqueidentifier,
    @StartTime datetime,
    @EndTime datetime,
    @Status nvarchar(100),
    @ProcessedItems int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentProcessRun]
        (
            [SourceID],
            [StartTime],
            [EndTime],
            [Status],
            [ProcessedItems],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @SourceID,
            @StartTime,
            @EndTime,
            @Status,
            @ProcessedItems, 
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentSource]
GO

CREATE PROCEDURE [__mj].[spCreateContentSource]
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentSource]
        (
            [Name],
            [ContentTypeID],
            [ContentSourceTypeID],
            [ContentFileTypeID],
            [URL],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @ContentTypeID,
            @ContentSourceTypeID,
            @ContentFileTypeID,
            @URL,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentSourceParam]
GO

CREATE PROCEDURE [__mj].[spCreateContentSourceParam]
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeParamID uniqueidentifier,
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentSourceParam]
        (
            [ContentSourceID],
            [ContentSourceTypeParamID],
            [Value],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ContentSourceID,
            @ContentSourceTypeParamID,
            @Value,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentSourceParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentSourceParam] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentSourceType]
GO

CREATE PROCEDURE [__mj].[spCreateContentSourceType]
    @Name nvarchar(255),
    @Description nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentSourceType]
        (
            [Name],
            [Description],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description, 
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentSourceTypeParam]
GO

CREATE PROCEDURE [__mj].[spCreateContentSourceTypeParam]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentSourceTypeParam]
        (
            [Name],
            [Description],
            [Type],
            [DefaultValue],
            [IsRequired],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Type,
            @DefaultValue,
            @IsRequired,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentSourceTypeParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentSourceTypeParam] TO [cdp_Developer], [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spCreateContentType]
GO

CREATE PROCEDURE [__mj].[spCreateContentType]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentType]
        (
            [Name],
            [Description],
            [AIModelID],
            [MinTags],
            [MaxTags],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @AIModelID,
            @MinTags,
            @MaxTags,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]
    

DROP PROCEDURE IF EXISTS [__mj].[spCreateContentTypeAttribute]
GO

CREATE PROCEDURE [__mj].[spCreateContentTypeAttribute]
    @ContentTypeID uniqueidentifier,
    @Name nvarchar(100),
    @Prompt nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ContentTypeAttribute]
        (
            [ContentTypeID],
            [Name],
            [Prompt],
            [Description],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ContentTypeID,
            @Name,
            @Prompt,
            @Description,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwContentTypeAttributes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateContentTypeAttribute] TO [cdp_Developer], [cdp_Integration]


DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentFileType]
GO

CREATE PROCEDURE [__mj].[spDeleteContentFileType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentFileType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentFileType] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentItem]
GO

CREATE PROCEDURE [__mj].[spDeleteContentItem]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentItem]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentItem] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentItemAttribute]
GO

CREATE PROCEDURE [__mj].[spDeleteContentItemAttribute]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentItemAttribute]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentItemAttribute] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentItemTag]
GO

CREATE PROCEDURE [__mj].[spDeleteContentItemTag]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentItemTag]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentItemTag] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentProcessRun]
GO

CREATE PROCEDURE [__mj].[spDeleteContentProcessRun]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentProcessRun]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentProcessRun] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentSource]
GO

CREATE PROCEDURE [__mj].[spDeleteContentSource]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentSource]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentSource] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentSourceParam]
GO

CREATE PROCEDURE [__mj].[spDeleteContentSourceParam]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentSourceParam]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentSourceParam] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentSourceType]
GO

CREATE PROCEDURE [__mj].[spDeleteContentSourceType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentSourceType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentSourceType] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentSourceTypeParam]
GO

CREATE PROCEDURE [__mj].[spDeleteContentSourceTypeParam]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentSourceTypeParam]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentSourceTypeParam] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentType]
GO

CREATE PROCEDURE [__mj].[spDeleteContentType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentType] TO [cdp_Integration]
    
DROP PROCEDURE IF EXISTS [__mj].[spDeleteContentTypeAttribute]
GO

CREATE PROCEDURE [__mj].[spDeleteContentTypeAttribute]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ContentTypeAttribute]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteContentTypeAttribute] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentFileType]
GO

CREATE PROCEDURE [__mj].[spUpdateContentFileType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @FileExtension nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentFileType]
    SET 
        [Name] = @Name,
        [FileExtension] = @FileExtension
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentFileTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentFileType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentFileType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentFileType
GO
CREATE TRIGGER [__mj].trgUpdateContentFileType
ON [__mj].[ContentFileType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentFileType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentFileType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentItem]
GO

CREATE PROCEDURE [__mj].[spUpdateContentItem]
    @ID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentItem]
    SET 
        [ContentSourceID] = @ContentSourceID,
        [Name] = @Name,
        [Description] = @Description,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [Checksum] = @Checksum,
        [URL] = @URL,
        [Text] = @Text
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentItem
GO
CREATE TRIGGER [__mj].trgUpdateContentItem
ON [__mj].[ContentItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemAttribute  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentItemAttribute]
GO

CREATE PROCEDURE [__mj].[spUpdateContentItemAttribute]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentItemAttribute]
    SET 
        [ContentItemID] = @ContentItemID,
        [Name] = @Name,
        [Value] = @Value
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentItemAttributes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentItemAttribute] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemAttribute table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentItemAttribute
GO
CREATE TRIGGER [__mj].trgUpdateContentItemAttribute
ON [__mj].[ContentItemAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentItemAttribute]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentItemAttribute] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemTag  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentItemTag]
GO

CREATE PROCEDURE [__mj].[spUpdateContentItemTag]
    @ID uniqueidentifier,
    @ItemID uniqueidentifier,
    @Tag nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentItemTag]
    SET 
        [ItemID] = @ItemID,
        [Tag] = @Tag
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentItemTags] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentItemTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemTag table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentItemTag
GO
CREATE TRIGGER [__mj].trgUpdateContentItemTag
ON [__mj].[ContentItemTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentItemTag]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentItemTag] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRun  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentProcessRun]
GO

CREATE PROCEDURE [__mj].[spUpdateContentProcessRun]
    @ID uniqueidentifier,
    @SourceID uniqueidentifier,
    @StartTime datetime,
    @EndTime datetime,
    @Status nvarchar(100),
    @ProcessedItems int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentProcessRun]
    SET 
        [SourceID] = @SourceID,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Status] = @Status,
        [ProcessedItems] = @ProcessedItems
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentProcessRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentProcessRun
GO
CREATE TRIGGER [__mj].trgUpdateContentProcessRun
ON [__mj].[ContentProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentProcessRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentProcessRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentSource]
GO

CREATE PROCEDURE [__mj].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSource]
    SET 
        [Name] = @Name,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [URL] = @URL
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentSources] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentSource
GO
CREATE TRIGGER [__mj].trgUpdateContentSource
ON [__mj].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSource]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentSource] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceParam  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentSourceParam]
GO

CREATE PROCEDURE [__mj].[spUpdateContentSourceParam]
    @ID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeParamID uniqueidentifier,
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSourceParam]
    SET 
        [ContentSourceID] = @ContentSourceID,
        [ContentSourceTypeParamID] = @ContentSourceTypeParamID,
        [Value] = @Value
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentSourceParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentSourceParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentSourceParam
GO
CREATE TRIGGER [__mj].trgUpdateContentSourceParam
ON [__mj].[ContentSourceParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSourceParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentSourceParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceType  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentSourceType]
GO

CREATE PROCEDURE [__mj].[spUpdateContentSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSourceType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentSourceTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentSourceType
GO
CREATE TRIGGER [__mj].trgUpdateContentSourceType
ON [__mj].[ContentSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSourceType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentSourceType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceTypeParam  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentSourceTypeParam]
GO

CREATE PROCEDURE [__mj].[spUpdateContentSourceTypeParam]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSourceTypeParam]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [DefaultValue] = @DefaultValue,
        [IsRequired] = @IsRequired
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentSourceTypeParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentSourceTypeParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceTypeParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentSourceTypeParam
GO
CREATE TRIGGER [__mj].trgUpdateContentSourceTypeParam
ON [__mj].[ContentSourceTypeParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentSourceTypeParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentSourceTypeParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentType]
GO

CREATE PROCEDURE [__mj].[spUpdateContentType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [AIModelID] = @AIModelID,
        [MinTags] = @MinTags,
        [MaxTags] = @MaxTags
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentType
GO
CREATE TRIGGER [__mj].trgUpdateContentType
ON [__mj].[ContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentTypeAttribute  
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateContentTypeAttribute]
GO

CREATE PROCEDURE [__mj].[spUpdateContentTypeAttribute]
    @ID uniqueidentifier,
    @ContentTypeID uniqueidentifier,
    @Name nvarchar(100),
    @Prompt nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentTypeAttribute]
    SET 
        [ContentTypeID] = @ContentTypeID,
        [Name] = @Name,
        [Prompt] = @Prompt,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwContentTypeAttributes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateContentTypeAttribute] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentTypeAttribute table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateContentTypeAttribute
GO
CREATE TRIGGER [__mj].trgUpdateContentTypeAttribute
ON [__mj].[ContentTypeAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ContentTypeAttribute]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ContentTypeAttribute] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO

DROP VIEW IF EXISTS [__mj].[vwContentFileTypes]
GO

CREATE VIEW [__mj].[vwContentFileTypes]
AS
SELECT 
    c.*
FROM
    [__mj].[ContentFileType] AS c
GO
GRANT SELECT ON [__mj].[vwContentFileTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [__mj].[vwContentItemAttributes]
GO

CREATE VIEW [__mj].[vwContentItemAttributes]
AS
SELECT 
    c.*,
    ContentItem_ContentItemID.[Name] AS [ContentItem]
FROM
    [__mj].[ContentItemAttribute] AS c
INNER JOIN
    [__mj].[ContentItem] AS ContentItem_ContentItemID
  ON
    [c].[ContentItemID] = ContentItem_ContentItemID.[ID]
GO
GRANT SELECT ON [__mj].[vwContentItemAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [__mj].[vwContentItems]
GO

CREATE VIEW [__mj].[vwContentItems]
AS
SELECT 
    c.*
FROM
    [__mj].[ContentItem] AS c
GO
GRANT SELECT ON [__mj].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentItemTags]
GO

CREATE VIEW [__mj].[vwContentItemTags]
AS
SELECT 
    c.*,
    ContentItem_ItemID.[Name] AS [Item]
FROM
    [__mj].[ContentItemTag] AS c
INNER JOIN
    [__mj].[ContentItem] AS ContentItem_ItemID
  ON
    [c].[ItemID] = ContentItem_ItemID.[ID]
GO
GRANT SELECT ON [__mj].[vwContentItemTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentProcessRuns]
GO

CREATE VIEW [__mj].[vwContentProcessRuns]
AS
SELECT 
    c.*,
    ContentSource_SourceID.[Name] AS [Source]
FROM
    [__mj].[ContentProcessRun] AS c
INNER JOIN
    [__mj].[ContentSource] AS ContentSource_SourceID
  ON
    [c].[SourceID] = ContentSource_SourceID.[ID]
GO
GRANT SELECT ON [__mj].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentSourceParams]
GO

CREATE VIEW [__mj].[vwContentSourceParams]
AS
SELECT 
    c.*,
    ContentSource_ContentSourceID.[Name] AS [ContentSource]
FROM
    [__mj].[ContentSourceParam] AS c
INNER JOIN
    [__mj].[ContentSource] AS ContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = ContentSource_ContentSourceID.[ID]
GO
GRANT SELECT ON [__mj].[vwContentSourceParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentSources]
GO

CREATE VIEW [__mj].[vwContentSources]
AS
SELECT 
    c.*
FROM
    [__mj].[ContentSource] AS c
GO
GRANT SELECT ON [__mj].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentSourceTypeParams]
GO

CREATE VIEW [__mj].[vwContentSourceTypeParams]
AS
SELECT 
    c.*
FROM
    [__mj].[ContentSourceTypeParam] AS c
GO
GRANT SELECT ON [__mj].[vwContentSourceTypeParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentSourceTypes]
GO

CREATE VIEW [__mj].[vwContentSourceTypes]
AS
SELECT 
    c.*
FROM
    [__mj].[ContentSourceType] AS c
GO
GRANT SELECT ON [__mj].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentTypeAttributes]
GO

CREATE VIEW [__mj].[vwContentTypeAttributes]
AS
SELECT 
    c.*
FROM
    [__mj].[ContentTypeAttribute] AS c
GO
GRANT SELECT ON [__mj].[vwContentTypeAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    
DROP VIEW IF EXISTS [__mj].[vwContentTypes]
GO

CREATE VIEW [__mj].[vwContentTypes]
AS
SELECT 
    c.*,
    AIModel_AIModelID.[Name] AS [AIModel]
FROM
    [__mj].[ContentType] AS c
INNER JOIN
    [__mj].[AIModel] AS AIModel_AIModelID
  ON
    [c].[AIModelID] = AIModel_AIModelID.[ID]
GO
GRANT SELECT ON [__mj].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]