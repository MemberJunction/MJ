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
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 7, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 8, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 3, 'ContentTypeID', 'Content Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 4, 'ContentSourceTypeID', 'Content Source Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 5, 'ContentFileTypeID', 'Content File Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 6, 'URL', 'URL', NULL, 'nvarchar', 4000, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 7, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 8, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentSourceID', 'Content Source ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 3, 'ContentSourceTypeParamID', 'Content Source Type Param ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Value', 'Value', NULL, 'nvarchar', -1, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 5, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 6, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Description', 'Description', NULL, 'nvarchar', 2000, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 4, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 5, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Type', 'Type', NULL, 'nvarchar', 100, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 5, 'DefaultValue', 'Default Value', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 6, 'IsRequired', 'Is Required', NULL, 'bit', 1, 1, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 7, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'BB2E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 8, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, 'AIModelID', 'AIModel ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, 'MinTags', 'Min Tags', NULL, 'int', 4, 10, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 6, 'MaxTags', 'Max Tags', NULL, 'int', 4, 10, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 7, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 8, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentTypeID', 'Content Type ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Name', 'Name', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Prompt', 'Prompt', NULL, 'nvarchar', -1, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 6, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'AC93AD50-0E66-EF11-A752-C0A5E8ACCB22', 7, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 2, 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 3, 'FileExtension', 'File Extension', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 4, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 5, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
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
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 11, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 12, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ContentItemID', 'Content Item ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Name', 'Name', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 1, 1, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 4, 'Value', 'Value', NULL, 'nvarchar', -1, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 5, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 6, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'newsequentialid()', 0, 0, 0, NULL, NULL, 0, 1, 0, 1, 1, 1, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 2, 'ItemID', 'Item ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 'null', 0, 1, 0, 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'ID', 0, 0, 1, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 3, 'Tag', 'Tag', NULL, 'nvarchar', 400, 0, 0, 0, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 4, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )
INSERT INTO [${flyway:defaultSchema}].EntityField ( EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType ) VALUES ( 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 5, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 'getutcdate()', 0, 0, 0, NULL, NULL, 0, 0, 0, 1, 0, 0, 'Search' )


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

INSERT INTO [${flyway:defaultSchema}].ContentFileType ( ID, Name, FileExtension ) VALUES ( 'AE0E6E7A-3D5F-EF11-991A-00224822CE23', 'PDF', '.pdf' )
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( ID, Name, FileExtension ) VALUES ( 'F12D885B-2267-EF11-991A-6045BDFE5B84', 'DOCX', '.docx' )
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( ID, Name, FileExtension ) VALUES ( '50157898-9560-EF11-991A-00224822CE23', 'XML', '.xml' )
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( ID, Name, FileExtension ) VALUES ( '4F157898-9560-EF11-991A-00224822CE23', 'HTML', '.html' )

INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( ID, Name, Description ) VALUES ( '23037E2A-9760-EF11-991A-00224822CE23', 'Local File System', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( ID, Name, Description ) VALUES ( '24037E2A-9760-EF11-991A-00224822CE23', 'Website', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( ID, Name, Description ) VALUES ( 'AC04F730-9760-EF11-991A-00224822CE23', 'RSS Feed', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( ID, Name, Description ) VALUES ( 'B8B8C0BE-3E5F-EF11-991A-00224822CE23', 'Azure Blob Storage', NULL )

INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('F938CC79-3E5F-EF11-991A-00224822CE23', 'CrawlOtherSitesInTopLevelDomain', 'Dictates whether we crawl links from a website at the same domain level as the link provided.', 'Boolean', 'false', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('1A3C1E89-3E5F-EF11-991A-00224822CE23', 'CrawlSitesInLowerLevelDomain', 'Dictates whether we crawl sites that are in lower level domains from the starting URL.', 'Boolean', 'false', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('F0720095-3E5F-EF11-991A-00224822CE23', 'MaxDepth', 'Specifies the maximum depth that we crawl the site.', 'Number', '0', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('5419D4FB-F463-EF11-991A-6045BDFE5B84', 'RootURL', 'Optional parameter to specify what form any scraped links must start with, and defaults to the homepage of the website.', 'String', Null, 0)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('27C704A1-F963-EF11-991A-6045BDFE5B84', 'URLPattern', 'Optional parameter for the Webcrawler that defines a regular expression pattern that the URL must match when extracting links on a page. The default is a regular expression that allows for any link.', 'RegExp', '^.*$', 0)

/****************************************************************************************
Generated SQL From CodeGen for New Entities
****************************************************************************************/

-- Action
INSERT INTO [${flyway:defaultSchema}].Action ( ID, CategoryID, Name, Description, Type, UserPrompt, UserComments, Code, CodeComments, CodeApprovalStatus, CodeApprovalComments, CodeApprovedByUserID, CodeApprovedAt, CodeLocked, ForceCodeGeneration, RetentionPeriod, Status) VALUES ('D8781B41-9C76-EF11-9C36-000D3A9EBD44', Null, 'Autotag and Vectorize Content', 'Autotag Content and create vectors of the content items that are created.', 'Custom', Null, Null, Null, Null, 'Pending', Null, Null, Null, 0, 0, Null, 'Active')

-- ActionParam
INSERT INTO [${flyway:defaultSchema}].ActionParam (ID, ActionID, Name, DefaultValue, Type, ValueType, IsArray, Description, IsRequired) VALUES ('B2A953B5-9C76-EF11-9C36-000D3A9EBD44', 'D8781B41-9C76-EF11-9C36-000D3A9EBD44', 'Autotag', '1', 'Input', 'Scalar', 0, 'A bit to indicate if we autotag or not. 1 indicates we should autotag, 0 we should not', 1)
INSERT INTO [${flyway:defaultSchema}].ActionParam (ID, ActionID, Name, DefaultValue, Type, ValueType, IsArray, Description, IsRequired) VALUES ('0E7EF5C0-9C76-EF11-9C36-000D3A9EBD44', 'D8781B41-9C76-EF11-9C36-000D3A9EBD44', 'Vectorize', '1', 'Input', 'Scalar', 0, 'A bit to indicate if we vectorize the content items or not. 1 indicates we should vectorize, 0 we should not', 1)
INSERT INTO [${flyway:defaultSchema}].ActionParam (ID, ActionID, Name, DefaultValue, Type, ValueType, IsArray, Description, IsRequired) VALUES ('3A8EC430-A076-EF11-9C36-000D3A9EBD44', 'D8781B41-9C76-EF11-9C36-000D3A9EBD44', 'EntityNames', 'Content Items', 'Input', 'Scalar', 1, 'Name of the entity to vectorize', 1)

-- ScheduledAction
INSERT INTO [${flyway:defaultSchema}].ScheduledAction ( ID, Name, Description, CreatedByUserID, ActionID, Type, CronExpression, Timezone, Status, IntervalDays, DayOfWeek, DayOfMonth, Month, CustomCronExpression) VALUES ('5B259747-9D76-EF11-9C36-000D3A9EBD44', 'Autotag And Vectorize Content', 'Scheduled action for content autotagging and vectorizing.', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', 'D8781B41-9C76-EF11-9C36-000D3A9EBD44', 'Monthly', Null, 'EST', 'Active', Null, Null, Null, Null, Null)

-- ScheduledActionParam
INSERT INTO [${flyway:defaultSchema}].ScheduledActionParam (ID, ScheduledActionID, ActionParamID, ValueType, Value, Comments) VALUES ('F0EDB58A-9D76-EF11-9C36-000D3A9EBD44', '5B259747-9D76-EF11-9C36-000D3A9EBD44', 'B2A953B5-9C76-EF11-9C36-000D3A9EBD44', 'Static', '1', NULL)
INSERT INTO [${flyway:defaultSchema}].ScheduledActionParam (ID, ScheduledActionID, ActionParamID, ValueType, Value, Comments) VALUES ('CBBFE191-9D76-EF11-9C36-000D3A9EBD44', '5B259747-9D76-EF11-9C36-000D3A9EBD44', '0E7EF5C0-9C76-EF11-9C36-000D3A9EBD44', 'Static', '1', NULL)
INSERT INTO [${flyway:defaultSchema}].ScheduledActionParam (ID, ScheduledActionID, ActionParamID, ValueType, Value, Comments) VALUES ('45DDB63A-A076-EF11-9C36-000D3A9EBD44', '5B259747-9D76-EF11-9C36-000D3A9EBD44', '3A8EC430-A076-EF11-9C36-000D3A9EBD44', 'Static', 'Content Items', NULL)

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentFileType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentFileType]
    @Name nvarchar(255),
    @FileExtension nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentFileType]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentFileTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItem]
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
    [${flyway:defaultSchema}].[ContentItem]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentItemAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemAttribute]
    @ContentItemID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentItemAttribute]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemAttributes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemAttribute] TO [cdp_Developer], [cdp_Integration]


DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentItemTag]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemTag]
    @ItemID uniqueidentifier,
    @Tag nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentItemTag]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemTag] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentProcessRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun]
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
    [${flyway:defaultSchema}].[ContentProcessRun]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentSource]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
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
    [${flyway:defaultSchema}].[ContentSource]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentSourceParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceParam]
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeParamID uniqueidentifier,
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentSourceParam]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSourceParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceParam] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentSourceType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceType]
    @Name nvarchar(255),
    @Description nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentSourceType]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentSourceTypeParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceTypeParam]
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
    [${flyway:defaultSchema}].[ContentSourceTypeParam]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSourceTypeParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceTypeParam] TO [cdp_Developer], [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentType]
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
    [${flyway:defaultSchema}].[ContentType]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]


DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentTypeAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentTypeAttribute]
    @ContentTypeID uniqueidentifier,
    @Name nvarchar(100),
    @Prompt nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentTypeAttribute]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwContentTypeAttributes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentTypeAttribute] TO [cdp_Developer], [cdp_Integration]


DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentFileType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentFileType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentFileType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItem]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentItemAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemAttribute]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemAttribute]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemAttribute] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentItemTag]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemTag]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemTag] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentProcessRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRun]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentSource]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentSourceParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSourceParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceParam] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentSourceType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSourceType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentSourceTypeParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceTypeParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSourceTypeParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceTypeParam] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentTypeAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentTypeAttribute]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentTypeAttribute]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentTypeAttribute] TO [cdp_Integration]

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentFileType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentFileType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @FileExtension nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentFileType]
    SET
        [Name] = @Name,
        [FileExtension] = @FileExtension
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentFileTypes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentFileType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentFileType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentFileType
ON [${flyway:defaultSchema}].[ContentFileType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentFileType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentFileType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItem]
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
        [${flyway:defaultSchema}].[ContentItem]
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
                                        [${flyway:defaultSchema}].[vwContentItems]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentItem
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItem
ON [${flyway:defaultSchema}].[ContentItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemAttribute
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentItemAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemAttribute]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemAttribute]
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
                                        [${flyway:defaultSchema}].[vwContentItemAttributes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemAttribute] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemAttribute table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentItemAttribute
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemAttribute
ON [${flyway:defaultSchema}].[ContentItemAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemAttribute]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemAttribute] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentItemTag]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemTag]
    @ID uniqueidentifier,
    @ItemID uniqueidentifier,
    @Tag nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemTag]
    SET
        [ItemID] = @ItemID,
        [Tag] = @Tag
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemTags]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemTag table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentItemTag
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemTag
ON [${flyway:defaultSchema}].[ContentItemTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentProcessRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun]
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
        [${flyway:defaultSchema}].[ContentProcessRun]
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
                                        [${flyway:defaultSchema}].[vwContentProcessRuns]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentProcessRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRun
ON [${flyway:defaultSchema}].[ContentProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentSource]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
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
        [${flyway:defaultSchema}].[ContentSource]
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
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentSource
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentSourceParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceParam]
    @ID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeParamID uniqueidentifier,
    @Value nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceParam]
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
                                        [${flyway:defaultSchema}].[vwContentSourceParams]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentSourceParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSourceParam
ON [${flyway:defaultSchema}].[ContentSourceParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSourceParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentSourceType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSourceTypes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentSourceType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSourceType
ON [${flyway:defaultSchema}].[ContentSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceTypeParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentSourceTypeParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceTypeParam]
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
        [${flyway:defaultSchema}].[ContentSourceTypeParam]
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
                                        [${flyway:defaultSchema}].[vwContentSourceTypeParams]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceTypeParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceTypeParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentSourceTypeParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSourceTypeParam
ON [${flyway:defaultSchema}].[ContentSourceTypeParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceTypeParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSourceTypeParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType]
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
        [${flyway:defaultSchema}].[ContentType]
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
                                        [${flyway:defaultSchema}].[vwContentTypes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentType
ON [${flyway:defaultSchema}].[ContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentTypeAttribute
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentTypeAttribute]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentTypeAttribute]
    @ID uniqueidentifier,
    @ContentTypeID uniqueidentifier,
    @Name nvarchar(100),
    @Prompt nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentTypeAttribute]
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
                                        [${flyway:defaultSchema}].[vwContentTypeAttributes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentTypeAttribute] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentTypeAttribute table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentTypeAttribute
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentTypeAttribute
ON [${flyway:defaultSchema}].[ContentTypeAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentTypeAttribute]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentTypeAttribute] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentFileTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentFileTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentFileType] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentItemAttributes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemAttributes]
AS
SELECT
    c.*,
    ContentItem_ContentItemID.[Name] AS [ContentItem]
FROM
    [${flyway:defaultSchema}].[ContentItemAttribute] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS ContentItem_ContentItemID
  ON
    [c].[ContentItemID] = ContentItem_ContentItemID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentItems]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItems]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentItem] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentItemTags]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemTags]
AS
SELECT
    c.*,
    ContentItem_ItemID.[Name] AS [Item]
FROM
    [${flyway:defaultSchema}].[ContentItemTag] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS ContentItem_ItemID
  ON
    [c].[ItemID] = ContentItem_ItemID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentProcessRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRuns]
AS
SELECT
    c.*,
    ContentSource_SourceID.[Name] AS [Source]
FROM
    [${flyway:defaultSchema}].[ContentProcessRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS ContentSource_SourceID
  ON
    [c].[SourceID] = ContentSource_SourceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentSourceParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSourceParams]
AS
SELECT
    c.*,
    ContentSource_ContentSourceID.[Name] AS [ContentSource]
FROM
    [${flyway:defaultSchema}].[ContentSourceParam] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS ContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = ContentSource_ContentSourceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentSources]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentSourceTypeParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSourceTypeParams]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentSourceTypeParam] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypeParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentSourceTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSourceTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentSourceType] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentTypeAttributes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentTypeAttributes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentTypeAttribute] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypeAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentTypes]
AS
SELECT
    c.*,
    AIModel_AIModelID.[Name] AS [AIModel]
FROM
    [${flyway:defaultSchema}].[ContentType] AS c
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID
  ON
    [c].[AIModelID] = AIModel_AIModelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
