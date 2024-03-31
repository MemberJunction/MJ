/*
  MJ STRUCTURE INSTALL SCRIPT 1.0
*/
SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS ON
GO
SET XACT_ABORT ON
GO
SET TRANSACTION ISOLATION LEVEL Serializable
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating full text catalogs'
GO
CREATE FULLTEXT CATALOG [full_text_test]
WITH ACCENT_SENSITIVITY = ON
AUTHORIZATION [dbo]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
BEGIN TRANSACTION
GO
DECLARE @associate bit
SELECT @associate = CASE SERVERPROPERTY('EngineEdition') WHEN 5 THEN 1 ELSE 0 END
IF @associate = 0 EXEC sp_executesql N'SELECT @count = COUNT(*) FROM master.dbo.syslogins WHERE loginname = N''MJ_CodeGen''', N'@count bit OUT', @associate OUT
IF @associate = 1
BEGIN
    PRINT N'Creating user [MJ_CodeGen] and mapping to the login [MJ_CodeGen]'
    CREATE USER [MJ_CodeGen] FOR LOGIN [MJ_CodeGen]
END
ELSE
BEGIN
    PRINT N'Creating user [MJ_CodeGen] without login'
    CREATE USER [MJ_CodeGen] WITHOUT LOGIN
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DECLARE @associate bit
SELECT @associate = CASE SERVERPROPERTY('EngineEdition') WHEN 5 THEN 1 ELSE 0 END
IF @associate = 0 EXEC sp_executesql N'SELECT @count = COUNT(*) FROM master.dbo.syslogins WHERE loginname = N''MJ_CodeGen_Dev''', N'@count bit OUT', @associate OUT
IF @associate = 1
BEGIN
    PRINT N'Creating user [MJ_CodeGen_Dev] and mapping to the login [MJ_CodeGen_Dev]'
    CREATE USER [MJ_CodeGen_Dev] FOR LOGIN [MJ_CodeGen_Dev]
END
ELSE
BEGIN
    PRINT N'Creating user [MJ_CodeGen_Dev] without login'
    CREATE USER [MJ_CodeGen_Dev] WITHOUT LOGIN
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DECLARE @associate bit
SELECT @associate = CASE SERVERPROPERTY('EngineEdition') WHEN 5 THEN 1 ELSE 0 END
IF @associate = 0 EXEC sp_executesql N'SELECT @count = COUNT(*) FROM master.dbo.syslogins WHERE loginname = N''MJ_Connect''', N'@count bit OUT', @associate OUT
IF @associate = 1
BEGIN
    PRINT N'Creating user [MJ_Connect] and mapping to the login [MJ_Connect]'
    CREATE USER [MJ_Connect] FOR LOGIN [MJ_Connect]
END
ELSE
BEGIN
    PRINT N'Creating user [MJ_Connect] without login'
    CREATE USER [MJ_Connect] WITHOUT LOGIN
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DECLARE @associate bit
SELECT @associate = CASE SERVERPROPERTY('EngineEdition') WHEN 5 THEN 1 ELSE 0 END
IF @associate = 0 EXEC sp_executesql N'SELECT @count = COUNT(*) FROM master.dbo.syslogins WHERE loginname = N''MJ_Connect_Dev''', N'@count bit OUT', @associate OUT
IF @associate = 1
BEGIN
    PRINT N'Creating user [MJ_Connect_Dev] and mapping to the login [MJ_Connect_Dev]'
    CREATE USER [MJ_Connect_Dev] FOR LOGIN [MJ_Connect_Dev]
END
ELSE
BEGIN
    PRINT N'Creating user [MJ_Connect_Dev] without login'
    CREATE USER [MJ_Connect_Dev] WITHOUT LOGIN
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating role cdp_BI'
GO
CREATE ROLE [cdp_BI]
AUTHORIZATION [db_securityadmin]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating role cdp_CodeGen'
GO
CREATE ROLE [cdp_CodeGen]
AUTHORIZATION [db_securityadmin]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating role cdp_Developer'
GO
CREATE ROLE [cdp_Developer]
AUTHORIZATION [db_securityadmin]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating role cdp_Integration'
GO
CREATE ROLE [cdp_Integration]
AUTHORIZATION [db_securityadmin]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating role cdp_UI'
GO
CREATE ROLE [cdp_UI]
AUTHORIZATION [db_securityadmin]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering members of role cdp_Developer'
GO
ALTER ROLE [cdp_Developer] ADD MEMBER [MJ_Connect_Dev]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering members of role cdp_Integration'
GO
ALTER ROLE [cdp_Integration] ADD MEMBER [MJ_Connect_Dev]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering members of role cdp_UI'
GO
ALTER ROLE [cdp_UI] ADD MEMBER [MJ_Connect]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER ROLE [cdp_UI] ADD MEMBER [MJ_Connect_Dev]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating schemas'
GO
CREATE SCHEMA [__mj]
AUTHORIZATION [dbo]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating types'
GO
CREATE TYPE [__mj].[IDListTableType] AS TABLE
(
[ID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Employee]'
GO
CREATE TABLE [__mj].[Employee]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[BCMID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_Employee_BCMID] DEFAULT (newid()),
[FirstName] [nvarchar] (30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[LastName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Title] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Email] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Phone] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Active] [bit] NOT NULL CONSTRAINT [DF__Employee__Active__5D95E53A] DEFAULT ((1)),
[CompanyID] [int] NOT NULL,
[SupervisorID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Employee_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Employee_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Employee__3214EC2755313CC7] on [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [PK__Employee__3214EC2755313CC7] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [UQ__Employee__Email] UNIQUE NONCLUSTERED ([Email])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Conversation]'
GO
CREATE TABLE [__mj].[Conversation]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[ExternalID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Conversation_Type] DEFAULT (N'Skip'),
[IsArchived] [bit] NOT NULL CONSTRAINT [DF_Conversation_IsArchived] DEFAULT ((0)),
[LinkedEntityID] [int] NULL,
[LinkedRecordID] [int] NULL,
[DataContextID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Conversation_DateCreated] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Conversation_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Conversation] on [__mj].[Conversation]'
GO
ALTER TABLE [__mj].[Conversation] ADD CONSTRAINT [PK_Conversation] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ConversationDetail]'
GO
CREATE TABLE [__mj].[ConversationDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ConversationID] [int] NOT NULL,
[ExternalID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Role] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_ConversationDetail_Role] DEFAULT (user_name()),
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Error] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[HiddenToUser] [bit] NOT NULL CONSTRAINT [DF_ConversationDetail_HiddenToUser] DEFAULT ((0)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ConversationDetail_DateCreated] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ConversationDetail_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ConversationDetail] on [__mj].[ConversationDetail]'
GO
ALTER TABLE [__mj].[ConversationDetail] ADD CONSTRAINT [PK_ConversationDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[User]'
GO
CREATE TABLE [__mj].[User]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[FirstName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LastName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Title] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Email] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Type] [nchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_User_IsActive] DEFAULT ((0)),
[LinkedRecordType] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_User_LinkedRecordType] DEFAULT (N'None'),
[EmployeeID] [int] NULL,
[LinkedEntityID] [int] NULL,
[LinkedEntityRecordID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_User_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_User_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ApplicationUser] on [__mj].[User]'
GO
ALTER TABLE [__mj].[User] ADD CONSTRAINT [PK_ApplicationUser] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Dashboard]'
GO
CREATE TABLE [__mj].[Dashboard]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [int] NULL,
[UIConfigDetails] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [int] NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Dashboard] on [__mj].[Dashboard]'
GO
ALTER TABLE [__mj].[Dashboard] ADD CONSTRAINT [PK_Dashboard] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EmployeeRole]'
GO
CREATE TABLE [__mj].[EmployeeRole]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EmployeeID] [int] NOT NULL,
[RoleID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EmployeeRole_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EmployeeRole_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Employee__C27FE3125986E6A3] on [__mj].[EmployeeRole]'
GO
ALTER TABLE [__mj].[EmployeeRole] ADD CONSTRAINT [PK__Employee__C27FE3125986E6A3] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Role]'
GO
CREATE TABLE [__mj].[Role]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DirectoryID] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SQLName] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Role_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Role_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Role__3214EC27B72328F8] on [__mj].[Role]'
GO
ALTER TABLE [__mj].[Role] ADD CONSTRAINT [PK__Role__3214EC27B72328F8] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Role]'
GO
ALTER TABLE [__mj].[Role] ADD CONSTRAINT [UQ__Role__737584F6A210197E] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EmployeeSkill]'
GO
CREATE TABLE [__mj].[EmployeeSkill]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EmployeeID] [int] NOT NULL,
[SkillID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EmployeeSkill_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EmployeeSkill_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Employee__172A46EF36387801] on [__mj].[EmployeeSkill]'
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD CONSTRAINT [PK__Employee__172A46EF36387801] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Report]'
GO
CREATE TABLE [__mj].[Report]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [int] NULL,
[UserID] [int] NOT NULL,
[SharingScope] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Report_SharingScope] DEFAULT (N'Personal'),
[ConversationID] [int] NULL,
[ConversationDetailID] [int] NULL,
[DataContextID] [int] NULL,
[Configuration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OutputTriggerTypeID] [int] NULL,
[OutputFormatTypeID] [int] NULL,
[OutputDeliveryTypeID] [int] NULL,
[OutputEventID] [int] NULL,
[OutputFrequency] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OutputTargetEmail] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OutputWorkflowID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Report_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Report_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Report] on [__mj].[Report]'
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [PK_Report] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[OutputDeliveryType]'
GO
CREATE TABLE [__mj].[OutputDeliveryType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputDeliveryType] on [__mj].[OutputDeliveryType]'
GO
ALTER TABLE [__mj].[OutputDeliveryType] ADD CONSTRAINT [PK_OutputDeliveryType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[OutputFormatType]'
GO
CREATE TABLE [__mj].[OutputFormatType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayFormat] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputFormatType] on [__mj].[OutputFormatType]'
GO
ALTER TABLE [__mj].[OutputFormatType] ADD CONSTRAINT [PK_OutputFormatType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[OutputTriggerType]'
GO
CREATE TABLE [__mj].[OutputTriggerType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputTriggerType] on [__mj].[OutputTriggerType]'
GO
ALTER TABLE [__mj].[OutputTriggerType] ADD CONSTRAINT [PK_OutputTriggerType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Workflow]'
GO
CREATE TABLE [__mj].[Workflow]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[WorkflowEngineName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CompanyName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Workflow_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Workflow_UpdatedAt] DEFAULT (getdate()),
[AutoRunEnabled] [bit] NOT NULL CONSTRAINT [DF_Workflow_AutoRunEnabled] DEFAULT ((0)),
[AutoRunIntervalUnits] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AutoRunInterval] [int] NULL,
[SubclassName] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Workflow] on [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [PK_Workflow] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [UQ_Workflow_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ReportSnapshot]'
GO
CREATE TABLE [__mj].[ReportSnapshot]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ReportID] [int] NOT NULL,
[ResultSet] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ReportSnapshot_CreatedAt] DEFAULT (getdate()),
[UserID] [int] NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ReportSnapshot] on [__mj].[ReportSnapshot]'
GO
ALTER TABLE [__mj].[ReportSnapshot] ADD CONSTRAINT [PK_ReportSnapshot] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Entity]'
GO
CREATE TABLE [__mj].[Entity]
(
[ID] [int] NOT NULL,
[ParentID] [int] NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[NameSuffix] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AutoUpdateDescription] [bit] NOT NULL CONSTRAINT [DF_Entity_AutoUpdateDescription] DEFAULT ((1)),
[BaseTable] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[BaseView] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[BaseViewGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_BaseViewGenerated] DEFAULT ((1)),
[SchemaName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Entity_Schema] DEFAULT (N'dbo'),
[VirtualEntity] [bit] NOT NULL CONSTRAINT [DF_Entity_VirtualEntity] DEFAULT ((0)),
[TrackRecordChanges] [bit] NOT NULL CONSTRAINT [DF_Entity_TrackRecordChanges] DEFAULT ((1)),
[AuditRecordAccess] [bit] NOT NULL CONSTRAINT [DF_Entity_AuditRecordAccess] DEFAULT ((1)),
[AuditViewRuns] [bit] NOT NULL CONSTRAINT [DF_Entity_AuditViewRuns] DEFAULT ((1)),
[IncludeInAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_IncludeInAPI] DEFAULT ((0)),
[AllowAllRowsAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_AllowReturnAllAPI] DEFAULT ((0)),
[AllowUpdateAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_AllowEditsAPI] DEFAULT ((0)),
[AllowCreateAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_AllowCreateAPI] DEFAULT ((0)),
[AllowDeleteAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_AllowDeleteAPI] DEFAULT ((0)),
[CustomResolverAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_CustomResolverAPI] DEFAULT ((0)),
[AllowUserSearchAPI] [bit] NOT NULL CONSTRAINT [DF_Entity_AllowUserSearchAPI] DEFAULT ((0)),
[FullTextSearchEnabled] [bit] NOT NULL CONSTRAINT [DF_Entity_FullTextSearchEnabled] DEFAULT ((0)),
[FullTextCatalog] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[FullTextCatalogGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_FullTextCatalogGenerated] DEFAULT ((1)),
[FullTextIndex] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[FullTextIndexGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_FullTextIndexGenerated] DEFAULT ((1)),
[FullTextSearchFunction] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[FullTextSearchFunctionGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_FullTextSearchFunctionGenerated] DEFAULT ((1)),
[UserViewMaxRows] [int] NULL CONSTRAINT [DF_Entity_UserViewMaxRows] DEFAULT ((1000)),
[spCreate] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[spUpdate] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[spDelete] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[spCreateGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_spCreateGenerated] DEFAULT ((1)),
[spUpdateGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_spUpdateGenerated] DEFAULT ((1)),
[spDeleteGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_spDeleteGenerated] DEFAULT ((1)),
[CascadeDeletes] [bit] NOT NULL CONSTRAINT [DF_Entity_CascadeDeletes] DEFAULT ((0)),
[UserFormGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_UserFormGenerated] DEFAULT ((1)),
[EntityObjectSubclassName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityObjectSubclassImport] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Entity_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Entity_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Entity] on [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [PK_Entity] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_Entity_Name] on [__mj].[Entity]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_Entity_Name] ON [__mj].[Entity] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ResourceType]'
GO
CREATE TABLE [__mj].[ResourceType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Icon] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ResourceType_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ResourceType_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ResourceType] on [__mj].[ResourceType]'
GO
ALTER TABLE [__mj].[ResourceType] ADD CONSTRAINT [PK_ResourceType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ResourceType]'
GO
ALTER TABLE [__mj].[ResourceType] ADD CONSTRAINT [UQ_ResourceType_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Tag]'
GO
CREATE TABLE [__mj].[Tag]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Tag] on [__mj].[Tag]'
GO
ALTER TABLE [__mj].[Tag] ADD CONSTRAINT [PK_Tag] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TaggedItem]'
GO
CREATE TABLE [__mj].[TaggedItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[TagID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TaggedItem] on [__mj].[TaggedItem]'
GO
ALTER TABLE [__mj].[TaggedItem] ADD CONSTRAINT [PK_TaggedItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[WorkspaceItem]'
GO
CREATE TABLE [__mj].[WorkspaceItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[WorkSpaceID] [int] NOT NULL,
[ResourceTypeID] [int] NOT NULL,
[ResourceRecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Sequence] [int] NOT NULL,
[Configuration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_WorkspaceItem] on [__mj].[WorkspaceItem]'
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD CONSTRAINT [PK_WorkspaceItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Workspace]'
GO
CREATE TABLE [__mj].[Workspace]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Workspace] on [__mj].[Workspace]'
GO
ALTER TABLE [__mj].[Workspace] ADD CONSTRAINT [PK_Workspace] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegration]'
GO
CREATE TABLE [__mj].[CompanyIntegration]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CompanyName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IntegrationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NULL,
[AccessToken] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RefreshToken] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TokenExpirationDate] [datetime] NULL,
[APIKey] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegration_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegration_UpdatedAt] DEFAULT (getdate()),
[ExternalSystemID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsExternalSystemReadOnly] [bit] NOT NULL CONSTRAINT [DF__CompanyIn__IsExt__6A07746E] DEFAULT ((0)),
[ClientID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ClientSecret] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CustomAttribute1] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__CompanyI__3214EC2739C558AB] on [__mj].[CompanyIntegration]'
GO
ALTER TABLE [__mj].[CompanyIntegration] ADD CONSTRAINT [PK__CompanyI__3214EC2739C558AB] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIModel]'
GO
CREATE TABLE [__mj].[AIModel]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Vendor] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AIModelTypeID] [int] NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverImportPath] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_AIModel_IsActive] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_AIModel_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_AIModel_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModel] on [__mj].[AIModel]'
GO
ALTER TABLE [__mj].[AIModel] ADD CONSTRAINT [PK_AIModel] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIAction]'
GO
CREATE TABLE [__mj].[AIAction]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultModelID] [int] NULL,
[DefaultPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_AIAction_IsActive] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_AIAction_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_AIAction_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIAction] on [__mj].[AIAction]'
GO
ALTER TABLE [__mj].[AIAction] ADD CONSTRAINT [PK_AIAction] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIModelType]'
GO
CREATE TABLE [__mj].[AIModelType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModelType] on [__mj].[AIModelType]'
GO
ALTER TABLE [__mj].[AIModelType] ADD CONSTRAINT [PK_AIModelType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIModelAction]'
GO
CREATE TABLE [__mj].[AIModelAction]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[AIModelID] [int] NOT NULL,
[AIActionID] [int] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_AIModelAction_IsActive] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_AIModelAction_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_AIModelAction_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModelAction] on [__mj].[AIModelAction]'
GO
ALTER TABLE [__mj].[AIModelAction] ADD CONSTRAINT [PK_AIModelAction] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Application]'
GO
CREATE TABLE [__mj].[Application]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Application_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Application_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Application] on [__mj].[Application]'
GO
ALTER TABLE [__mj].[Application] ADD CONSTRAINT [PK_Application] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Application]'
GO
ALTER TABLE [__mj].[Application] ADD CONSTRAINT [UQ_Application_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ApplicationEntity]'
GO
CREATE TABLE [__mj].[ApplicationEntity]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ApplicationName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [int] NOT NULL,
[Sequence] [int] NOT NULL,
[DefaultForNewUser] [bit] NOT NULL CONSTRAINT [DF_ApplicationEntity_DefaultForNewUser] DEFAULT ((0)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ApplicationEntity_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ApplicationEntity_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ApplicationEntity] on [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [PK_ApplicationEntity] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AuditLogType]'
GO
CREATE TABLE [__mj].[AuditLogType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ParentID] [int] NULL,
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AuthorizationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_AuditType_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_AuditType_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AuditType] on [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [PK_AuditType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [UQ_AuditLogType] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AuditLog]'
GO
CREATE TABLE [__mj].[AuditLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[AuditLogTypeName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [int] NOT NULL,
[AuthorizationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_AuditLog_Status] DEFAULT (N'Allow'),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Details] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [int] NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_AuditLog_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_AuditLog_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AuditLog] on [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [PK_AuditLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Authorization]'
GO
CREATE TABLE [__mj].[Authorization]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ParentID] [int] NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_Authorization_IsActive] DEFAULT ((1)),
[UseAuditLog] [bit] NOT NULL CONSTRAINT [DF_Authorization_UseAuditLog] DEFAULT ((1)),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Authorization_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Authorization_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Authorization] on [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] ADD CONSTRAINT [PK_Authorization] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] ADD CONSTRAINT [UQ_Authorization] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AuthorizationRole]'
GO
CREATE TABLE [__mj].[AuthorizationRole]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[AuthorizationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RoleName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_AuthorizationRole_Type] DEFAULT (N'grant'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_AuthorizationRole_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_AuthorizationRole_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AuthorizationRole] on [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [PK_AuthorizationRole] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Company]'
GO
CREATE TABLE [__mj].[Company]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Website] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LogoURL] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Company_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Company_UpdatedAt] DEFAULT (getdate()),
[Domain] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Company__3214EC278DAF44DD] on [__mj].[Company]'
GO
ALTER TABLE [__mj].[Company] ADD CONSTRAINT [PK__Company__3214EC278DAF44DD] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Company]'
GO
ALTER TABLE [__mj].[Company] ADD CONSTRAINT [UQ_Company_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Integration]'
GO
CREATE TABLE [__mj].[Integration]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[NavigationBaseURL] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ClassName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ImportPath] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[BatchMaxRequestCount] [int] NOT NULL CONSTRAINT [DF__Integrati__Batch__522FEADD] DEFAULT ((-1)),
[BatchRequestWaitTime] [int] NOT NULL CONSTRAINT [DF__Integrati__Batch__53240F16] DEFAULT ((-1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Integration_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Integration_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Integrat__3214EC27B672ECF0] on [__mj].[Integration]'
GO
ALTER TABLE [__mj].[Integration] ADD CONSTRAINT [PK__Integrat__3214EC27B672ECF0] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Integration]'
GO
ALTER TABLE [__mj].[Integration] ADD CONSTRAINT [UQ_Integration_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRecordMap]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRecordMap]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CompanyIntegrationID] [int] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityID] [int] NOT NULL,
[EntityRecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegrationRecordMap_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegrationRecordMap_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRecordMap] on [__mj].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] ADD CONSTRAINT [PK_CompanyIntegrationRecordMap] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRun]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CompanyIntegrationID] [int] NOT NULL,
[RunByUserID] [int] NOT NULL,
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[TotalRecords] [int] NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRun] on [__mj].[CompanyIntegrationRun]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRun] ADD CONSTRAINT [PK_CompanyIntegrationRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRunAPILog]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRunAPILog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CompanyIntegrationRunID] [int] NOT NULL,
[ExecutedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegrationRunAPILog_ExecutedAt] DEFAULT (getdate()),
[IsSuccess] [bit] NOT NULL CONSTRAINT [DF__CompanyIn__IsSuc__753864A1] DEFAULT ((0)),
[RequestMethod] [nvarchar] (12) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[URL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Parameters] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRunAPICall] on [__mj].[CompanyIntegrationRunAPILog]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunAPILog] ADD CONSTRAINT [PK_CompanyIntegrationRunAPICall] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRunDetail]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRunDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CompanyIntegrationRunID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Action] [nchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ExecutedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegrationRunDetail_ExecutedAt] DEFAULT (getdate()),
[IsSuccess] [bit] NOT NULL CONSTRAINT [DF__CompanyIn__IsSuc__2AA05119] DEFAULT ((0))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRunDetail] on [__mj].[CompanyIntegrationRunDetail]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] ADD CONSTRAINT [PK_CompanyIntegrationRunDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DashboardCategory]'
GO
CREATE TABLE [__mj].[DashboardCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DashboardCategory_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DashboardCategory_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DashboardCategory] on [__mj].[DashboardCategory]'
GO
ALTER TABLE [__mj].[DashboardCategory] ADD CONSTRAINT [PK_DashboardCategory] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DataContext]'
GO
CREATE TABLE [__mj].[DataContext]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [int] NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LastRefreshedAt] [datetime] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DataContext_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DataContext_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DataContext] on [__mj].[DataContext]'
GO
ALTER TABLE [__mj].[DataContext] ADD CONSTRAINT [PK_DataContext] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DataContextItem]'
GO
CREATE TABLE [__mj].[DataContextItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[DataContextID] [int] NOT NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ViewID] [int] NULL,
[QueryID] [int] NULL,
[EntityID] [int] NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DataJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LastRefreshedAt] [datetime] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DataContextItem_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DataContextItem_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DataContextItem] on [__mj].[DataContextItem]'
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [PK_DataContextItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Query]'
GO
CREATE TABLE [__mj].[Query]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [int] NULL,
[SQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OriginalSQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Feedback] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Quey_Status] DEFAULT (N'Pending'),
[QualityRank] [int] NULL CONSTRAINT [DF_Quey_QualityRank] DEFAULT ((0)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Quey_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Quey_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Quey] on [__mj].[Query]'
GO
ALTER TABLE [__mj].[Query] ADD CONSTRAINT [PK_Quey] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserView]'
GO
CREATE TABLE [__mj].[UserView]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[GUID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_UserView_UniqueCode] DEFAULT (newid()),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [int] NULL,
[IsShared] [bit] NOT NULL CONSTRAINT [DF_UserView_IsShared] DEFAULT ((0)),
[IsDefault] [bit] NOT NULL CONSTRAINT [DF_UserView_IsDefault] DEFAULT ((0)),
[GridState] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[FilterState] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CustomFilterState] [bit] NOT NULL CONSTRAINT [DF_UserView_CustomFilterState] DEFAULT ((0)),
[SmartFilterEnabled] [bit] NOT NULL CONSTRAINT [DF_UserView_SmartFilterEnabled] DEFAULT ((0)),
[SmartFilterPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SmartFilterWhereClause] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SmartFilterExplanation] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[WhereClause] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CustomWhereClause] [bit] NOT NULL CONSTRAINT [DF_UserView_CustomWhereClause] DEFAULT ((0)),
[SortState] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NULL CONSTRAINT [DF_UserView_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NULL CONSTRAINT [DF_UserView_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserView] on [__mj].[UserView]'
GO
ALTER TABLE [__mj].[UserView] ADD CONSTRAINT [PK_UserView] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[UserView]'
GO
ALTER TABLE [__mj].[UserView] ADD CONSTRAINT [UQ_UserView_GUID] UNIQUE NONCLUSTERED ([GUID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Dataset]'
GO
CREATE TABLE [__mj].[Dataset]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Dataset_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Dataset_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Dataset] on [__mj].[Dataset]'
GO
ALTER TABLE [__mj].[Dataset] ADD CONSTRAINT [PK_Dataset] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Dataset]'
GO
ALTER TABLE [__mj].[Dataset] ADD CONSTRAINT [UQ_Dataset_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DatasetItem]'
GO
CREATE TABLE [__mj].[DatasetItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Code] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DatasetName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_DatasetItem_Sequence] DEFAULT ((0)),
[EntityID] [int] NOT NULL,
[WhereClause] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DateFieldToCheck] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DatasetItem_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DatasetItem_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DatasetItem] on [__mj].[DatasetItem]'
GO
ALTER TABLE [__mj].[DatasetItem] ADD CONSTRAINT [PK_DatasetItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EmployeeCompanyIntegration]'
GO
CREATE TABLE [__mj].[EmployeeCompanyIntegration]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EmployeeID] [int] NOT NULL,
[CompanyIntegrationID] [int] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__EmployeeC__IsAct__09FE775D] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EmployeeCompanyIntegration_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EmployeeCompanyIntegration_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EmployeeCompanyIntegration] on [__mj].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] ADD CONSTRAINT [PK_EmployeeCompanyIntegration] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Skill]'
GO
CREATE TABLE [__mj].[Skill]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Skill_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Skill_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Skill] on [__mj].[Skill]'
GO
ALTER TABLE [__mj].[Skill] ADD CONSTRAINT [PK_Skill] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityAIAction]'
GO
CREATE TABLE [__mj].[EntityAIAction]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[AIActionID] [int] NOT NULL,
[AIModelID] [int] NULL,
[Name] [nvarchar] (25) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Prompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TriggerEvent] [nchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityAIAction_ExecutionTiming] DEFAULT (N'After Save'),
[UserMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[OutputType] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityAIAction_OutputRoute] DEFAULT (N'FIeld'),
[OutputField] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SkipIfOutputFieldNotEmpty] [bit] NOT NULL CONSTRAINT [DF_EntityAIAction_SkipIfOutputFieldNotEmpty] DEFAULT ((1)),
[OutputEntityID] [int] NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityAIAction] on [__mj].[EntityAIAction]'
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [PK_EntityAIAction] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocument]'
GO
CREATE TABLE [__mj].[EntityDocument]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityID] [int] NOT NULL,
[TypeID] [int] NOT NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityDocument_Status] DEFAULT (N'Pending'),
[Template] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocument_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocument_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocument] on [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [PK_EntityDocument] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_EntityDocument_Name] on [__mj].[EntityDocument]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_EntityDocument_Name] ON [__mj].[EntityDocument] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocumentType]'
GO
CREATE TABLE [__mj].[EntityDocumentType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocumentType_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocumentType_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocumentType] on [__mj].[EntityDocumentType]'
GO
ALTER TABLE [__mj].[EntityDocumentType] ADD CONSTRAINT [PK_EntityDocumentType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocumentRun]'
GO
CREATE TABLE [__mj].[EntityDocumentRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityDocumentID] [int] NOT NULL,
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityDocumentRun_Status] DEFAULT (N'Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocumentRun_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocumentRun_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocumentRun] on [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD CONSTRAINT [PK_EntityDocumentRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityField]'
GO
CREATE TABLE [__mj].[EntityField]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_EntityField_Sequence] DEFAULT ((0)),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AutoUpdateDescription] [bit] NOT NULL CONSTRAINT [DF_EntityField_AutoUpdateDescription] DEFAULT ((1)),
[IsPrimaryKey] [bit] NOT NULL CONSTRAINT [DF_EntityField_IsPrimaryKey] DEFAULT ((0)),
[IsUnique] [bit] NOT NULL CONSTRAINT [DF_EntityField_IsUnique] DEFAULT ((0)),
[Category] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Length] [int] NULL,
[Precision] [int] NULL,
[Scale] [int] NULL,
[AllowsNull] [bit] NOT NULL CONSTRAINT [DF_EntityField_AllowsNull] DEFAULT ((1)),
[DefaultValue] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AutoIncrement] [bit] NOT NULL CONSTRAINT [DF_EntityField_AutoIncrement] DEFAULT ((0)),
[ValueListType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityField_ValueListType] DEFAULT (N'None'),
[ExtendedType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultInView] [bit] NOT NULL CONSTRAINT [DF_EntityField_DefaultInGrid] DEFAULT ((0)),
[ViewCellTemplate] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultColumnWidth] [int] NULL,
[AllowUpdateAPI] [bit] NOT NULL CONSTRAINT [DF_EntityField_AllowEditAPI] DEFAULT ((1)),
[AllowUpdateInView] [bit] NOT NULL CONSTRAINT [DF_EntityField_AllowViewEditing] DEFAULT ((1)),
[IncludeInUserSearchAPI] [bit] NOT NULL CONSTRAINT [DF_EntityField_IncludeInUserSearchAPI] DEFAULT ((0)),
[FullTextSearchEnabled] [bit] NOT NULL CONSTRAINT [DF_EntityField_FullTextSearchEnabled] DEFAULT ((0)),
[UserSearchParamFormatAPI] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IncludeInGeneratedForm] [bit] NOT NULL CONSTRAINT [DF_EntityField_IncludeInGeneratedForm] DEFAULT ((1)),
[GeneratedFormSection] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityField_GeneratedFormSection] DEFAULT (N'Details'),
[IsVirtual] [bit] NOT NULL CONSTRAINT [DF_EntityField_IsVirtual] DEFAULT ((0)),
[IsNameField] [bit] NOT NULL CONSTRAINT [DF_EntityField_IsNameField] DEFAULT ((0)),
[RelatedEntityID] [int] NULL,
[RelatedEntityFieldName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IncludeRelatedEntityNameFieldInBaseView] [bit] NOT NULL CONSTRAINT [DF_EntityField_IncludeRelatedEntityNameFieldInBaseView] DEFAULT ((1)),
[RelatedEntityNameFieldMap] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityField_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityField_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityField] on [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [PK_EntityField] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_EntityField_EntityID_Name] on [__mj].[EntityField]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_EntityField_EntityID_Name] ON [__mj].[EntityField] ([EntityID], [Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityFieldValue]'
GO
CREATE TABLE [__mj].[EntityFieldValue]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[EntityFieldName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Sequence] [int] NOT NULL,
[Value] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Code] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityFieldValue_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityFieldValue_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityFieldValue] on [__mj].[EntityFieldValue]'
GO
ALTER TABLE [__mj].[EntityFieldValue] ADD CONSTRAINT [PK_EntityFieldValue] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RowLevelSecurityFilter]'
GO
CREATE TABLE [__mj].[RowLevelSecurityFilter]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[FilterText] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_RowLevelSecurityFilter_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_RowLevelSecurityFilter_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RowLevelSecurityFilter] on [__mj].[RowLevelSecurityFilter]'
GO
ALTER TABLE [__mj].[RowLevelSecurityFilter] ADD CONSTRAINT [PK_RowLevelSecurityFilter] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityPermission]'
GO
CREATE TABLE [__mj].[EntityPermission]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[RoleName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CanCreate] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanCreate] DEFAULT ((0)),
[CanRead] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanRead] DEFAULT ((0)),
[CanUpdate] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanUpdate] DEFAULT ((0)),
[CanDelete] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanDelete] DEFAULT ((0)),
[ReadRLSFilterID] [int] NULL,
[CreateRLSFilterID] [int] NULL,
[UpdateRLSFilterID] [int] NULL,
[DeleteRLSFilterID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityPermission_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityPermission_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityPermission] on [__mj].[EntityPermission]'
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [PK_EntityPermission] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityRecordDocument]'
GO
CREATE TABLE [__mj].[EntityRecordDocument]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DocumentText] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[VectorIndexID] [int] NOT NULL,
[VectorID] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[VectorJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityRecordUpdatedAt] [datetime] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityRecordDocument_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityRecordDocument_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityRecordDocument] on [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [PK_EntityRecordDocument] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityRelationship]'
GO
CREATE TABLE [__mj].[EntityRelationship]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_EntityRelationship_Sequence] DEFAULT ((0)),
[RelatedEntityID] [int] NOT NULL,
[BundleInAPI] [bit] NOT NULL CONSTRAINT [DF_admin.EntityRelationships_BundleInAPI] DEFAULT ((1)),
[IncludeInParentAllQuery] [bit] NOT NULL CONSTRAINT [DF_EntityRelationship_IncludeInParentAllQuery] DEFAULT ((0)),
[Type] [nchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityRelationship_Type] DEFAULT (N'One To Many'),
[EntityKeyField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RelatedEntityJoinField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[JoinView] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[JoinEntityJoinField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[JoinEntityInverseJoinField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayInForm] [bit] NOT NULL CONSTRAINT [DF_EntityRelationship_DisplayInForm] DEFAULT ((1)),
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayUserViewGUID] [uniqueidentifier] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityRelationship_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityRelationship_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_admin.EntityRelationships] on [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [PK_admin.EntityRelationships] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ErrorLog]'
GO
CREATE TABLE [__mj].[ErrorLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CompanyIntegrationRunID] [int] NULL,
[CompanyIntegrationRunDetailID] [int] NULL,
[Code] [nchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ErrorLog_CreatedAt] DEFAULT (getdate()),
[CreatedBy] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL CONSTRAINT [DF_ErrorLog_CreatedBy] DEFAULT (suser_name()),
[Status] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Category] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Details] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ErrorLog] on [__mj].[ErrorLog]'
GO
ALTER TABLE [__mj].[ErrorLog] ADD CONSTRAINT [PK_ErrorLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[FileCategory]'
GO
CREATE TABLE [__mj].[FileCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_FileCategory_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_FileCategory_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_FileCategory] on [__mj].[FileCategory]'
GO
ALTER TABLE [__mj].[FileCategory] ADD CONSTRAINT [PK_FileCategory] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[File]'
GO
CREATE TABLE [__mj].[File]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProviderID] [int] NOT NULL,
[ContentType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProviderKey] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [int] NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_File_Status] DEFAULT (N'Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_File_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_File_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_File] on [__mj].[File]'
GO
ALTER TABLE [__mj].[File] ADD CONSTRAINT [PK_File] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[FileStorageProvider]'
GO
CREATE TABLE [__mj].[FileStorageProvider]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ServerDriverKey] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ClientDriverKey] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Priority] [int] NOT NULL CONSTRAINT [DF_FileProvider_Priority] DEFAULT ((0)),
[IsActive] [bit] NOT NULL CONSTRAINT [DF_FileProvider_IsActive] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_FileProvider_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_FileProvider_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_FileProvider] on [__mj].[FileStorageProvider]'
GO
ALTER TABLE [__mj].[FileStorageProvider] ADD CONSTRAINT [PK_FileProvider] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[FileEntityRecordLink]'
GO
CREATE TABLE [__mj].[FileEntityRecordLink]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[FileID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_FileEntityRecordLink_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_FileEntityRecordLink_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_FileEntityRecordLink] on [__mj].[FileEntityRecordLink]'
GO
ALTER TABLE [__mj].[FileEntityRecordLink] ADD CONSTRAINT [PK_FileEntityRecordLink] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[IntegrationURLFormat]'
GO
CREATE TABLE [__mj].[IntegrationURLFormat]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[IntegrationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [int] NOT NULL,
[URLFormat] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_IntegrationURLFormat] on [__mj].[IntegrationURLFormat]'
GO
ALTER TABLE [__mj].[IntegrationURLFormat] ADD CONSTRAINT [PK_IntegrationURLFormat] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[List]'
GO
CREATE TABLE [__mj].[List]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [int] NULL,
[UserID] [int] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CompanyIntegrationID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_List_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_List_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_List] on [__mj].[List]'
GO
ALTER TABLE [__mj].[List] ADD CONSTRAINT [PK_List] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_List_Name] on [__mj].[List]'
GO
CREATE NONCLUSTERED INDEX [IX_List_Name] ON [__mj].[List] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ListDetail]'
GO
CREATE TABLE [__mj].[ListDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ListID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_ListDetail_Sequence] DEFAULT ((0))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ListDetail] on [__mj].[ListDetail]'
GO
ALTER TABLE [__mj].[ListDetail] ADD CONSTRAINT [PK_ListDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueryCategory]'
GO
CREATE TABLE [__mj].[QueryCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [int] NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_QueryCategory_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_QueryCategory_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueryCategory] on [__mj].[QueryCategory]'
GO
ALTER TABLE [__mj].[QueryCategory] ADD CONSTRAINT [PK_QueryCategory] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueryField]'
GO
CREATE TABLE [__mj].[QueryField]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[QueryID] [int] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Sequence] [int] NOT NULL,
[SQLBaseType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[SQLFullType] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[SourceEntityID] [int] NULL,
[SourceFieldName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsComputed] [bit] NOT NULL CONSTRAINT [DF_QueryField_IsComputed] DEFAULT ((0)),
[ComputationDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsSummary] [bit] NOT NULL CONSTRAINT [DF_QueryField_IsSummary] DEFAULT ((0)),
[SummaryDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_QueryField_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_QueryField_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueryField] on [__mj].[QueryField]'
GO
ALTER TABLE [__mj].[QueryField] ADD CONSTRAINT [PK_QueryField] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueryPermission]'
GO
CREATE TABLE [__mj].[QueryPermission]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[QueryID] [int] NOT NULL,
[RoleName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_QueryPermission_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_QueryPermission_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueryPermission] on [__mj].[QueryPermission]'
GO
ALTER TABLE [__mj].[QueryPermission] ADD CONSTRAINT [PK_QueryPermission] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueueType]'
GO
CREATE TABLE [__mj].[QueueType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DriverImportPath] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_QueueType_IsActive] DEFAULT ((1))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueueType] on [__mj].[QueueType]'
GO
ALTER TABLE [__mj].[QueueType] ADD CONSTRAINT [PK_QueueType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Queue]'
GO
CREATE TABLE [__mj].[Queue]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[QueueTypeID] [int] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_Queue_IsActive] DEFAULT ((0)),
[ProcessPID] [int] NULL,
[ProcessPlatform] [nvarchar] (30) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessVersion] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessCwd] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessIPAddress] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessMacAddress] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessOSName] [nvarchar] (25) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessOSVersion] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessHostName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessUserID] [nvarchar] (25) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProcessUserName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LastHeartbeat] [datetime] NOT NULL CONSTRAINT [DF_Queue_LastHeartbeat] DEFAULT (getdate()),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Queue_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Queue_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Queue] on [__mj].[Queue]'
GO
ALTER TABLE [__mj].[Queue] ADD CONSTRAINT [PK_Queue] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueueTask]'
GO
CREATE TABLE [__mj].[QueueTask]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[QueueID] [int] NOT NULL,
[Status] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_QueueTask_Status] DEFAULT (N'Pending'),
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[Data] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Options] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Output] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueueTask] on [__mj].[QueueTask]'
GO
ALTER TABLE [__mj].[QueueTask] ADD CONSTRAINT [PK_QueueTask] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordChange]'
GO
CREATE TABLE [__mj].[RecordChange]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [int] NOT NULL,
[ChangedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordChange_ChangedAt] DEFAULT (getdate()),
[ChangesJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ChangesDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[FullRecordJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordChange_Status] DEFAULT (N'Complete'),
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordChange] on [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [PK_RecordChange] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordMergeLog]'
GO
CREATE TABLE [__mj].[RecordMergeLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[SurvivingRecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[InitiatedByUserID] [int] NOT NULL,
[ApprovalStatus] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordMergeLog_ApprovalStatus] DEFAULT (N'Pending'),
[ApprovedByUserID] [int] NULL,
[ProcessingStatus] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordMergeLog_Status] DEFAULT (N'Pending'),
[ProcessingStartedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordMergeLog_StartedAt] DEFAULT (getdate()),
[ProcessingEndedAt] [datetime] NULL,
[ProcessingLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordMergeLog_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NULL CONSTRAINT [DF_RecordMergeLog_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordMergeLog] on [__mj].[RecordMergeLog]'
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [PK_RecordMergeLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordMergeDeletionLog]'
GO
CREATE TABLE [__mj].[RecordMergeDeletionLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[RecordMergeLogID] [int] NOT NULL,
[DeletedRecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordMergeDeletionLog_Status] DEFAULT (N'Pending'),
[ProcessingLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordMergeDeletionLog_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordMergeDeletionLog_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordMergeDeletionLog] on [__mj].[RecordMergeDeletionLog]'
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] ADD CONSTRAINT [PK_RecordMergeDeletionLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ReportCategory]'
GO
CREATE TABLE [__mj].[ReportCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ReportCategory_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ReportCategory_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ReportCategory] on [__mj].[ReportCategory]'
GO
ALTER TABLE [__mj].[ReportCategory] ADD CONSTRAINT [PK_ReportCategory] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[SystemEvent]'
GO
CREATE TABLE [__mj].[SystemEvent]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityID] [int] NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_SystemEvent] on [__mj].[SystemEvent]'
GO
ALTER TABLE [__mj].[SystemEvent] ADD CONSTRAINT [PK_SystemEvent] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserApplication]'
GO
CREATE TABLE [__mj].[UserApplication]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[ApplicationID] [int] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_UserApplication_Sequence] DEFAULT ((0)),
[IsActive] [bit] NOT NULL CONSTRAINT [DF_UserApplication_IsActive] DEFAULT ((1))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserApplication] on [__mj].[UserApplication]'
GO
ALTER TABLE [__mj].[UserApplication] ADD CONSTRAINT [PK_UserApplication] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserApplicationEntity]'
GO
CREATE TABLE [__mj].[UserApplicationEntity]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserApplicationID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_UserApplicationEntity_Sequence] DEFAULT ((0))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserApplicationEntity] on [__mj].[UserApplicationEntity]'
GO
ALTER TABLE [__mj].[UserApplicationEntity] ADD CONSTRAINT [PK_UserApplicationEntity] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserFavorite]'
GO
CREATE TABLE [__mj].[UserFavorite]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserFavorite_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserFavorite_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserFavorite_1] on [__mj].[UserFavorite]'
GO
ALTER TABLE [__mj].[UserFavorite] ADD CONSTRAINT [PK_UserFavorite_1] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserNotification]'
GO
CREATE TABLE [__mj].[UserNotification]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[Title] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ResourceTypeID] [int] NULL,
[ResourceRecordID] [int] NULL,
[ResourceConfiguration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Unread] [bit] NOT NULL CONSTRAINT [DF_Table_1_MarkedAsRead] DEFAULT ((1)),
[ReadAt] [datetime] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserNotification_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserNotification_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserNotification] on [__mj].[UserNotification]'
GO
ALTER TABLE [__mj].[UserNotification] ADD CONSTRAINT [PK_UserNotification] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserRecordLog]'
GO
CREATE TABLE [__mj].[UserRecordLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EarliestAt] [datetime] NOT NULL CONSTRAINT [DF_UserRecordLog_EarliestAt] DEFAULT (getdate()),
[LatestAt] [datetime] NOT NULL CONSTRAINT [DF_UserRecordLog_LatestAt] DEFAULT (getdate()),
[TotalCount] [int] NOT NULL CONSTRAINT [DF_UserRecordLog_TotalCount] DEFAULT ((0))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserRecordLog] on [__mj].[UserRecordLog]'
GO
ALTER TABLE [__mj].[UserRecordLog] ADD CONSTRAINT [PK_UserRecordLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserRole]'
GO
CREATE TABLE [__mj].[UserRole]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[RoleName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserRole_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserRole_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserRole] on [__mj].[UserRole]'
GO
ALTER TABLE [__mj].[UserRole] ADD CONSTRAINT [PK_UserRole] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserViewCategory]'
GO
CREATE TABLE [__mj].[UserViewCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserViewCategory_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_UserViewCategory_UpdatedAt] DEFAULT (getdate()),
[EntityID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewCategory] on [__mj].[UserViewCategory]'
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [PK_UserViewCategory] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserViewRun]'
GO
CREATE TABLE [__mj].[UserViewRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserViewID] [int] NOT NULL,
[RunAt] [datetime] NOT NULL,
[RunByUserID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewRun] on [__mj].[UserViewRun]'
GO
ALTER TABLE [__mj].[UserViewRun] ADD CONSTRAINT [PK_UserViewRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserViewRunDetail]'
GO
CREATE TABLE [__mj].[UserViewRunDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserViewRunID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewRunDetail] on [__mj].[UserViewRunDetail]'
GO
ALTER TABLE [__mj].[UserViewRunDetail] ADD CONSTRAINT [PK_UserViewRunDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[VectorIndex]'
GO
CREATE TABLE [__mj].[VectorIndex]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[VectorDatabaseID] [int] NOT NULL,
[EmbeddingModelID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_VectorIndex_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_VectorIndex_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_VectorIndex] on [__mj].[VectorIndex]'
GO
ALTER TABLE [__mj].[VectorIndex] ADD CONSTRAINT [PK_VectorIndex] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[VectorDatabase]'
GO
CREATE TABLE [__mj].[VectorDatabase]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultURL] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ClassKey] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_VectorDatabase_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_VectorDatabase_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_VectorDatabase] on [__mj].[VectorDatabase]'
GO
ALTER TABLE [__mj].[VectorDatabase] ADD CONSTRAINT [PK_VectorDatabase] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[WorkflowEngine]'
GO
CREATE TABLE [__mj].[WorkflowEngine]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverPath] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DriverClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_WorkflowEngine_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_WorkflowEngine_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_WorkflowEngine] on [__mj].[WorkflowEngine]'
GO
ALTER TABLE [__mj].[WorkflowEngine] ADD CONSTRAINT [PK_WorkflowEngine] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[WorkflowEngine]'
GO
ALTER TABLE [__mj].[WorkflowEngine] ADD CONSTRAINT [IX_WorkflowEngine] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[WorkflowRun]'
GO
CREATE TABLE [__mj].[WorkflowRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[WorkflowName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[StartedAt] [datetime] NOT NULL,
[EndedAt] [datetime] NULL,
[Status] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_WorkflowRun_Status] DEFAULT (N'Pending'),
[Results] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_WorkflowRun] on [__mj].[WorkflowRun]'
GO
ALTER TABLE [__mj].[WorkflowRun] ADD CONSTRAINT [PK_WorkflowRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueues]'
GO


CREATE VIEW [__mj].[vwQueues]
AS
SELECT 
    q.*,
    QueueType_QueueTypeID.[Name] AS [QueueType]
FROM
    [__mj].[Queue] AS q
INNER JOIN
    [__mj].[QueueType] AS QueueType_QueueTypeID
  ON
    [q].[QueueTypeID] = QueueType_QueueTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueueTasks]'
GO


CREATE VIEW [__mj].[vwQueueTasks]
AS
SELECT 
    q.*
FROM
    [__mj].[QueueTask] AS q
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[SchemaInfo]'
GO
CREATE TABLE [__mj].[SchemaInfo]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[SchemaName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityIDMin] [int] NOT NULL,
[EntityIDMax] [int] NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_SchemaInfo_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_SchemaInfo_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_SchemaInfo] on [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] ADD CONSTRAINT [PK_SchemaInfo] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] ADD CONSTRAINT [IX_SchemaInfo] UNIQUE NONCLUSTERED ([SchemaName])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDashboards]'
GO


CREATE VIEW [__mj].[vwDashboards]
AS
SELECT 
    d.*,
    DashboardCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[Dashboard] AS d
LEFT OUTER JOIN
    [__mj].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [__mj].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAIModelTypes]'
GO


CREATE VIEW [__mj].[vwAIModelTypes]
AS
SELECT 
    a.*
FROM
    [__mj].[AIModelType] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIModelType]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIModelType]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwAIModelTypes] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueue]'
GO


CREATE PROCEDURE [__mj].[spCreateQueue]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID int,
    @IsActive bit,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetime
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Queue]
        (
            [Name],
            [Description],
            [QueueTypeID],
            [IsActive],
            [ProcessPID],
            [ProcessPlatform],
            [ProcessVersion],
            [ProcessCwd],
            [ProcessIPAddress],
            [ProcessMacAddress],
            [ProcessOSName],
            [ProcessOSVersion],
            [ProcessHostName],
            [ProcessUserID],
            [ProcessUserName],
            [LastHeartbeat]
        )
    VALUES
        (
            @Name,
            @Description,
            @QueueTypeID,
            @IsActive,
            @ProcessPID,
            @ProcessPlatform,
            @ProcessVersion,
            @ProcessCwd,
            @ProcessIPAddress,
            @ProcessMacAddress,
            @ProcessOSName,
            @ProcessOSVersion,
            @ProcessHostName,
            @ProcessUserID,
            @ProcessUserName,
            @LastHeartbeat
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueues] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueueTask]'
GO


CREATE PROCEDURE [__mj].[spCreateQueueTask]
    @QueueID int,
    @Status nchar(10),
    @StartedAt datetime,
    @EndedAt datetime,
    @Data nvarchar(MAX),
    @Options nvarchar(MAX),
    @Output nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[QueueTask]
        (
            [QueueID],
            [Status],
            [StartedAt],
            [EndedAt],
            [Data],
            [Options],
            [Output],
            [ErrorMessage],
            [Comments]
        )
    VALUES
        (
            @QueueID,
            @Status,
            @StartedAt,
            @EndedAt,
            @Data,
            @Options,
            @Output,
            @ErrorMessage,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueueTasks] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[VersionInstallation]'
GO
CREATE TABLE [__mj].[VersionInstallation]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[MajorVersion] [int] NOT NULL,
[MinorVersion] [int] NOT NULL,
[PatchVersion] [int] NOT NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL CONSTRAINT [DF_VersionInstallation_Type] DEFAULT (N'System'),
[InstalledAt] [datetime] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_VersionInstallation_Status] DEFAULT (N'Pending'),
[InstallLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_VersionInstallation_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_VersionInstallation_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_VersionInstallation] on [__mj].[VersionInstallation]'
GO
ALTER TABLE [__mj].[VersionInstallation] ADD CONSTRAINT [PK_VersionInstallation] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDashboard]'
GO


CREATE PROCEDURE [__mj].[spCreateDashboard]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @UIConfigDetails nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Dashboard]
        (
            [Name],
            [Description],
            [CategoryID],
            [UIConfigDetails],
            [UserID]
        )
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @UIConfigDetails,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDashboards] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueue]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueue]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID int,
    @IsActive bit,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Queue]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [QueueTypeID] = @QueueTypeID,
        [IsActive] = @IsActive,
        [ProcessPID] = @ProcessPID,
        [ProcessPlatform] = @ProcessPlatform,
        [ProcessVersion] = @ProcessVersion,
        [ProcessCwd] = @ProcessCwd,
        [ProcessIPAddress] = @ProcessIPAddress,
        [ProcessMacAddress] = @ProcessMacAddress,
        [ProcessOSName] = @ProcessOSName,
        [ProcessOSVersion] = @ProcessOSVersion,
        [ProcessHostName] = @ProcessHostName,
        [ProcessUserID] = @ProcessUserID,
        [ProcessUserName] = @ProcessUserName,
        [LastHeartbeat] = @LastHeartbeat,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwQueues] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueueTask]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueueTask]
    @ID int,
    @QueueID int,
    @Status nchar(10),
    @StartedAt datetime,
    @EndedAt datetime,
    @Data nvarchar(MAX),
    @Options nvarchar(MAX),
    @Output nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueueTask]
    SET 
        [QueueID] = @QueueID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Data] = @Data,
        [Options] = @Options,
        [Output] = @Output,
        [ErrorMessage] = @ErrorMessage,
        [Comments] = @Comments
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwQueueTasks] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDashboard]'
GO


CREATE PROCEDURE [__mj].[spUpdateDashboard]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @UIConfigDetails nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Dashboard]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails,
        [UserID] = @UserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDashboards] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDashboard]'
GO


CREATE PROCEDURE [__mj].[spDeleteDashboard]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Dashboard]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwOutputTriggerTypes]'
GO


CREATE VIEW [__mj].[vwOutputTriggerTypes]
AS
SELECT 
    o.*
FROM
    [__mj].[OutputTriggerType] AS o
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwOutputDeliveryTypes]'
GO


CREATE VIEW [__mj].[vwOutputDeliveryTypes]
AS
SELECT 
    o.*
FROM
    [__mj].[OutputDeliveryType] AS o
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwOutputFormatTypes]'
GO


CREATE VIEW [__mj].[vwOutputFormatTypes]
AS
SELECT 
    o.*
FROM
    [__mj].[OutputFormatType] AS o
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwReportSnapshots]'
GO


CREATE VIEW [__mj].[vwReportSnapshots]
AS
SELECT 
    r.*,
    Report_ReportID.[Name] AS [Report],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[ReportSnapshot] AS r
INNER JOIN
    [__mj].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
LEFT OUTER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwReports]'
GO


CREATE VIEW [__mj].[vwReports]
AS
SELECT 
    r.*,
    ReportCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User],
    Conversation_ConversationID.[Name] AS [Conversation],
    DataContext_DataContextID.[Name] AS [DataContext],
    OutputTriggerType_OutputTriggerTypeID.[Name] AS [OutputTriggerType],
    OutputFormatType_OutputFormatTypeID.[Name] AS [OutputFormatType],
    OutputDeliveryType_OutputDeliveryTypeID.[Name] AS [OutputDeliveryType],
    OutputDeliveryType_OutputEventID.[Name] AS [OutputEvent]
FROM
    [__mj].[Report] AS r
LEFT OUTER JOIN
    [__mj].[ReportCategory] AS ReportCategory_CategoryID
  ON
    [r].[CategoryID] = ReportCategory_CategoryID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[Conversation] AS Conversation_ConversationID
  ON
    [r].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [__mj].[DataContext] AS DataContext_DataContextID
  ON
    [r].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [__mj].[OutputTriggerType] AS OutputTriggerType_OutputTriggerTypeID
  ON
    [r].[OutputTriggerTypeID] = OutputTriggerType_OutputTriggerTypeID.[ID]
LEFT OUTER JOIN
    [__mj].[OutputFormatType] AS OutputFormatType_OutputFormatTypeID
  ON
    [r].[OutputFormatTypeID] = OutputFormatType_OutputFormatTypeID.[ID]
LEFT OUTER JOIN
    [__mj].[OutputDeliveryType] AS OutputDeliveryType_OutputDeliveryTypeID
  ON
    [r].[OutputDeliveryTypeID] = OutputDeliveryType_OutputDeliveryTypeID.[ID]
LEFT OUTER JOIN
    [__mj].[OutputDeliveryType] AS OutputDeliveryType_OutputEventID
  ON
    [r].[OutputEventID] = OutputDeliveryType_OutputEventID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateReport]'
GO


CREATE PROCEDURE [__mj].[spCreateReport]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @UserID int,
    @SharingScope nvarchar(20),
    @ConversationID int,
    @ConversationDetailID int,
    @DataContextID int,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID int,
    @OutputFormatTypeID int,
    @OutputDeliveryTypeID int,
    @OutputEventID int,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Report]
        (
            [Name],
            [Description],
            [CategoryID],
            [UserID],
            [SharingScope],
            [ConversationID],
            [ConversationDetailID],
            [DataContextID],
            [Configuration],
            [OutputTriggerTypeID],
            [OutputFormatTypeID],
            [OutputDeliveryTypeID],
            [OutputEventID],
            [OutputFrequency],
            [OutputTargetEmail],
            [OutputWorkflowID]
        )
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @UserID,
            @SharingScope,
            @ConversationID,
            @ConversationDetailID,
            @DataContextID,
            @Configuration,
            @OutputTriggerTypeID,
            @OutputFormatTypeID,
            @OutputDeliveryTypeID,
            @OutputEventID,
            @OutputFrequency,
            @OutputTargetEmail,
            @OutputWorkflowID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwReports] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateReportSnapshot]'
GO


CREATE PROCEDURE [__mj].[spCreateReportSnapshot]
    @ReportID int,
    @ResultSet nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ReportSnapshot]
        (
            [ReportID],
            [ResultSet],
            [UserID]
        )
    VALUES
        (
            @ReportID,
            @ResultSet,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwReportSnapshots] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateReport]'
GO


CREATE PROCEDURE [__mj].[spUpdateReport]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @UserID int,
    @SharingScope nvarchar(20),
    @ConversationID int,
    @ConversationDetailID int,
    @DataContextID int,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID int,
    @OutputFormatTypeID int,
    @OutputDeliveryTypeID int,
    @OutputEventID int,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Report]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [DataContextID] = @DataContextID,
        [Configuration] = @Configuration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputEventID] = @OutputEventID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwReports] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateReportSnapshot]'
GO


CREATE PROCEDURE [__mj].[spUpdateReportSnapshot]
    @ID int,
    @ReportID int,
    @ResultSet nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportSnapshot]
    SET 
        [ReportID] = @ReportID,
        [ResultSet] = @ResultSet,
        [UserID] = @UserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwReportSnapshots] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteReport]'
GO


CREATE PROCEDURE [__mj].[spDeleteReport]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Report]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteReportSnapshot]'
GO


CREATE PROCEDURE [__mj].[spDeleteReportSnapshot]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ReportSnapshot]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTags]'
GO


CREATE VIEW [__mj].[vwTags]
AS
SELECT 
    t.*,
    Tag_ParentID.[Name] AS [Parent]
FROM
    [__mj].[Tag] AS t
LEFT OUTER JOIN
    [__mj].[Tag] AS Tag_ParentID
  ON
    [t].[ParentID] = Tag_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwResourceTypes]'
GO


CREATE VIEW [__mj].[vwResourceTypes]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[ResourceType] AS r
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwWorkspaces]'
GO


CREATE VIEW [__mj].[vwWorkspaces]
AS
SELECT 
    w.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[Workspace] AS w
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [w].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwWorkspaceItems]'
GO


CREATE VIEW [__mj].[vwWorkspaceItems]
AS
SELECT 
    w.*,
    Workspace_WorkSpaceID.[Name] AS [WorkSpace],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [__mj].[WorkspaceItem] AS w
INNER JOIN
    [__mj].[Workspace] AS Workspace_WorkSpaceID
  ON
    [w].[WorkSpaceID] = Workspace_WorkSpaceID.[ID]
INNER JOIN
    [__mj].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [w].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTaggedItems]'
GO


CREATE VIEW [__mj].[vwTaggedItems]
AS
SELECT 
    t.*,
    Tag_TagID.[Name] AS [Tag],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[TaggedItem] AS t
INNER JOIN
    [__mj].[Tag] AS Tag_TagID
  ON
    [t].[TagID] = Tag_TagID.[ID]
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [t].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateWorkspace]'
GO


CREATE PROCEDURE [__mj].[spCreateWorkspace]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Workspace]
        (
            [Name],
            [Description],
            [UserID]
        )
    VALUES
        (
            @Name,
            @Description,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwWorkspaces] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteTaggedItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteTaggedItem]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[TaggedItem]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateWorkspaceItem]'
GO


CREATE PROCEDURE [__mj].[spCreateWorkspaceItem]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkSpaceID int,
    @ResourceTypeID int,
    @ResourceRecordID nvarchar(255),
    @Sequence int,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[WorkspaceItem]
        (
            [Name],
            [Description],
            [WorkSpaceID],
            [ResourceTypeID],
            [ResourceRecordID],
            [Sequence],
            [Configuration]
        )
    VALUES
        (
            @Name,
            @Description,
            @WorkSpaceID,
            @ResourceTypeID,
            @ResourceRecordID,
            @Sequence,
            @Configuration
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwWorkspaceItems] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkspace]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkspace]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workspace]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwWorkspaces] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkspaceItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkspaceItem]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkSpaceID int,
    @ResourceTypeID int,
    @ResourceRecordID nvarchar(255),
    @Sequence int,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkspaceItem]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [WorkSpaceID] = @WorkSpaceID,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [Sequence] = @Sequence,
        [Configuration] = @Configuration
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwWorkspaceItems] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteWorkspace]'
GO


CREATE PROCEDURE [__mj].[spDeleteWorkspace]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Workspace]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanies]'
GO


CREATE VIEW [__mj].[vwCompanies]
AS
SELECT 
    c.*
FROM
    [__mj].[Company] AS c
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteWorkspaceItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteWorkspaceItem]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[WorkspaceItem]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEmployeeCompanyIntegrations]'
GO


CREATE VIEW [__mj].[vwEmployeeCompanyIntegrations]
AS
SELECT 
    e.*
FROM
    [__mj].[EmployeeCompanyIntegration] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDatasets]'
GO


CREATE VIEW [__mj].[vwDatasets]
AS
SELECT 
    d.*
FROM
    [__mj].[Dataset] AS d
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEmployees]'
GO

CREATE VIEW [__mj].[vwEmployees] 
AS
SELECT
	e.*,
	TRIM(e.FirstName) + ' ' + TRIM(e.LastName) FirstLast,
	TRIM(s.FirstName) + ' ' + TRIM(s.LastName) Supervisor,
	s.FirstName SupervisorFirstName,
	s.LastName SupervisorLastName,
	s.Email SupervisorEmail
FROM
	__mj.Employee e
LEFT OUTER JOIN
	__mj.Employee s
ON
	e.SupervisorID = s.ID

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEmployee]'
GO


CREATE PROCEDURE [__mj].[spCreateEmployee]
    @FirstName nvarchar(30),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Active bit,
    @CompanyID int,
    @SupervisorID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Employee]
        (
            [FirstName],
            [LastName],
            [Title],
            [Email],
            [Phone],
            [Active],
            [CompanyID],
            [SupervisorID]
        )
    VALUES
        (
            @FirstName,
            @LastName,
            @Title,
            @Email,
            @Phone,
            @Active,
            @CompanyID,
            @SupervisorID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEmployees] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDatasetItems]'
GO


CREATE VIEW [__mj].[vwDatasetItems]
AS
SELECT 
    d.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[DatasetItem] AS d
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEmployeeRoles]'
GO


CREATE VIEW [__mj].[vwEmployeeRoles]
AS
SELECT 
    e.*,
    Role_RoleID.[Name] AS [Role]
FROM
    [__mj].[EmployeeRole] AS e
INNER JOIN
    [__mj].[Role] AS Role_RoleID
  ON
    [e].[RoleID] = Role_RoleID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwConversations]'
GO


CREATE VIEW [__mj].[vwConversations]
AS
SELECT 
    c.*,
    User_UserID.[Name] AS [User],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity]
FROM
    [__mj].[Conversation] AS c
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntities]'
GO

CREATE VIEW [__mj].[vwEntities]
AS
SELECT 
	e.*,
	IIF(1 = ISNUMERIC(LEFT(e.Name, 1)),'_','') + REPLACE(e.Name, ' ', '') CodeName,
	IIF(1 = ISNUMERIC(LEFT(e.BaseTable, 1)),'_','') + REPLACE(e.BaseTable, ' ', '_') + IIF(e.NameSuffix IS NULL, '', e.NameSuffix) ClassName,
	IIF(1 = ISNUMERIC(LEFT(e.BaseTable, 1)),'_','') + REPLACE(e.BaseTable, ' ', '_') + IIF(e.NameSuffix IS NULL, '', e.NameSuffix) BaseTableCodeName,
	par.Name ParentEntity,
	par.BaseTable ParentBaseTable,
	par.BaseView ParentBaseView
FROM 
	[__mj].Entity e
LEFT OUTER JOIN 
	[__mj].Entity par
ON
	e.ParentID = par.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserFavorites]'
GO

CREATE VIEW [__mj].[vwUserFavorites]
AS
SELECT 
	uf.*,
	e.Name Entity,
	e.BaseTable EntityBaseTable,
	e.BaseView EntityBaseView
FROM 
	[__mj].UserFavorite uf
INNER JOIN
	vwEntities e
ON
	uf.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserFavorite]'
GO


CREATE PROCEDURE [__mj].[spCreateUserFavorite]
    @UserID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserFavorite]
        (
            [UserID],
            [EntityID],
            [RecordID]
        )
    VALUES
        (
            @UserID,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserFavorites] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserNotifications]'
GO


CREATE VIEW [__mj].[vwUserNotifications]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[UserNotification] AS u
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployeeCompanyIntegration]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployeeCompanyIntegration]
    @ID int,
    @EmployeeID int,
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeCompanyIntegration]
    SET 
        [EmployeeID] = @EmployeeID,
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEmployeeCompanyIntegrations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwConversationDetails]'
GO


CREATE VIEW [__mj].[vwConversationDetails]
AS
SELECT 
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation]
FROM
    [__mj].[ConversationDetail] AS c
INNER JOIN
    [__mj].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompany]'
GO


CREATE PROCEDURE [__mj].[spCreateCompany]
    @Name nvarchar(50),
    @Description nvarchar(200),
    @Website nvarchar(100),
    @LogoURL nvarchar(500),
    @Domain nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Company]
        (
            [Name],
            [Description],
            [Website],
            [LogoURL],
            [Domain]
        )
    VALUES
        (
            @Name,
            @Description,
            @Website,
            @LogoURL,
            @Domain
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCompanies] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateConversation]'
GO


CREATE PROCEDURE [__mj].[spCreateConversation]
    @UserID int,
    @ExternalID nvarchar(100),
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID int,
    @LinkedRecordID int,
    @DataContextID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Conversation]
        (
            [UserID],
            [ExternalID],
            [Name],
            [Description],
            [Type],
            [IsArchived],
            [LinkedEntityID],
            [LinkedRecordID],
            [DataContextID]
        )
    VALUES
        (
            @UserID,
            @ExternalID,
            @Name,
            @Description,
            @Type,
            @IsArchived,
            @LinkedEntityID,
            @LinkedRecordID,
            @DataContextID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwConversations] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployee]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployee]
    @ID int,
    @FirstName nvarchar(30),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Active bit,
    @CompanyID int,
    @SupervisorID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Employee]
    SET 
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Phone] = @Phone,
        [Active] = @Active,
        [CompanyID] = @CompanyID,
        [SupervisorID] = @SupervisorID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEmployees] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserNotification]'
GO


CREATE PROCEDURE [__mj].[spCreateUserNotification]
    @UserID int,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID int,
    @ResourceRecordID int,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserNotification]
        (
            [UserID],
            [Title],
            [Message],
            [ResourceTypeID],
            [ResourceRecordID],
            [ResourceConfiguration],
            [Unread],
            [ReadAt]
        )
    VALUES
        (
            @UserID,
            @Title,
            @Message,
            @ResourceTypeID,
            @ResourceRecordID,
            @ResourceConfiguration,
            @Unread,
            @ReadAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserNotifications] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployeeRole]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployeeRole]
    @ID int,
    @EmployeeID int,
    @RoleID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeRole]
    SET 
        [EmployeeID] = @EmployeeID,
        [RoleID] = @RoleID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEmployeeRoles] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateConversationDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateConversationDetail]
    @ConversationID int,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ConversationDetail]
        (
            [ConversationID],
            [ExternalID],
            [Role],
            [Message],
            [Error],
            [HiddenToUser]
        )
    VALUES
        (
            @ConversationID,
            @ExternalID,
            @Role,
            @Message,
            @Error,
            @HiddenToUser
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwConversationDetails] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserFavorite]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserFavorite]
    @ID int,
    @UserID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserFavorite]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserFavorites] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityFields]'
GO

CREATE VIEW [__mj].[vwEntityFields]
AS
SELECT
	ef.*,
	e.Name Entity,
	e.SchemaName,
	e.BaseTable,
	e.BaseView,
	e.CodeName EntityCodeName,
	e.ClassName EntityClassName,
	re.Name RelatedEntity,
	re.SchemaName RelatedEntitySchemaName,
	re.BaseTable RelatedEntityBaseTable,
	re.BaseView RelatedEntityBaseView,
	re.CodeName RelatedEntityCodeName,
	re.ClassName RelatedEntityClassName
FROM
	[__mj].EntityField ef
INNER JOIN
	[__mj].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
	[__mj].vwEntities re ON ef.RelatedEntityID = re.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateConversation]'
GO


CREATE PROCEDURE [__mj].[spUpdateConversation]
    @ID int,
    @UserID int,
    @ExternalID nvarchar(100),
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID int,
    @LinkedRecordID int,
    @DataContextID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Conversation]
    SET 
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [IsArchived] = @IsArchived,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordID] = @LinkedRecordID,
        [DataContextID] = @DataContextID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwConversations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompany]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompany]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(200),
    @Website nvarchar(100),
    @LogoURL nvarchar(500),
    @Domain nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Company]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Website] = @Website,
        [LogoURL] = @LogoURL,
        [UpdatedAt] = GETDATE(),
        [Domain] = @Domain
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwCompanies] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityRelationships]'
GO

CREATE VIEW [__mj].[vwEntityRelationships]
AS
SELECT
	er.*,
	e.Name Entity,
	e.BaseTable EntityBaseTable,
	e.BaseView EntityBaseView,
	relatedEntity.Name RelatedEntity,
	relatedEntity.BaseTable RelatedEntityBaseTable,
	relatedEntity.BaseView RelatedEntityBaseView,
	relatedEntity.ClassName RelatedEntityClassName,
	relatedEntity.CodeName RelatedEntityCodeName,
	relatedEntity.BaseTableCodeName RelatedEntityBaseTableCodeName,
	uv.Name DisplayUserViewName,
	uv.ID DisplayUserViewID
FROM
	[__mj].EntityRelationship er
INNER JOIN
	[__mj].Entity e
ON
	er.EntityID = e.ID
INNER JOIN
	[__mj].vwEntities relatedEntity
ON
	er.RelatedEntityID = relatedEntity.ID
LEFT OUTER JOIN
	[__mj].UserView uv
ON	
	er.DisplayUserViewGUID = uv.GUID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserNotification]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserNotification]
    @ID int,
    @UserID int,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID int,
    @ResourceRecordID int,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserNotification]
    SET 
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserNotifications] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEmployee]'
GO


CREATE PROCEDURE [__mj].[spDeleteEmployee]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Employee]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrations]'
GO

CREATE VIEW [__mj].[vwCompanyIntegrations] 
AS
SELECT 
  ci.*,
  c.ID CompanyID,
  i.ID IntegrationID,
  c.Name Company,
  i.Name Integration,
  i.ClassName DriverClassName,
  i.ImportPath DriverImportPath,
  cir.ID LastRunID,
  cir.StartedAt LastRunStartedAt,
  cir.EndedAt LastRunEndedAt
FROM 
  __mj.CompanyIntegration ci
INNER JOIN
  __mj.Company c ON ci.CompanyName = c.Name
INNER JOIN
  __mj.Integration i ON ci.IntegrationName = i.Name
LEFT OUTER JOIN
  __mj.CompanyIntegrationRun cir 
ON 
  ci.ID = cir.CompanyIntegrationID AND
  cir.ID = (SELECT TOP 1 cirInner.ID FROM __mj.CompanyIntegrationRun cirInner WHERE cirInner.CompanyIntegrationID = ci.ID ORDER BY StartedAt DESC)  
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateConversationDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateConversationDetail]
    @ID int,
    @ConversationID int,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ConversationDetail]
    SET 
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwConversationDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserFavorite]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserFavorite]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserFavorite]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserNotification]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserNotification]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserNotification]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteCompany]'
GO


CREATE PROCEDURE [__mj].[spDeleteCompany]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Company]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrationRunDetails]'
GO

CREATE VIEW [__mj].[vwCompanyIntegrationRunDetails]
AS
SELECT 
    cird.*,
	e.Name Entity,
	cir.StartedAt RunStartedAt,
	cir.EndedAt RunEndedAt
FROM
	__mj.CompanyIntegrationRunDetail cird
INNER JOIN
    __mj.CompanyIntegrationRun cir
ON
    cird.CompanyIntegrationRunID = cir.ID
INNER JOIN
	__mj.Entity e
ON
	cird.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteConversationDetail]'
GO


CREATE PROCEDURE [__mj].[spDeleteConversationDetail]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ConversationDetail]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRoles]'
GO


CREATE VIEW [__mj].[vwRoles]
AS
SELECT 
    r.*
FROM
    [__mj].[Role] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwSchemaInfos]'
GO


CREATE VIEW [__mj].[vwSchemaInfos]
AS
SELECT 
    s.*
FROM
    [__mj].[SchemaInfo] AS s
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwIntegrations]'
GO


CREATE VIEW [__mj].[vwIntegrations]
AS
SELECT 
    i.*
FROM
    [__mj].[Integration] AS i
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrationRecordMaps]'
GO


CREATE VIEW [__mj].[vwCompanyIntegrationRecordMaps]
AS
SELECT 
    c.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[CompanyIntegrationRecordMap] AS c
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [c].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwIntegrationURLFormats]'
GO

CREATE VIEW [__mj].[vwIntegrationURLFormats]
AS
SELECT 
	iuf.*,
	i.ID IntegrationID,
	i.Name Integration,
	i.NavigationBaseURL,
	i.NavigationBaseURL + iuf.URLFormat FullURLFormat
FROM
	__mj.IntegrationURLFormat iuf
INNER JOIN
	__mj.Integration i
ON
	iuf.IntegrationName = i.Name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateIntegrationURLFormat]'
GO


CREATE PROCEDURE [__mj].[spUpdateIntegrationURLFormat]
    @ID int,
    @IntegrationName nvarchar(100),
    @EntityID int,
    @URLFormat nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[IntegrationURLFormat]
    SET 
        [IntegrationName] = @IntegrationName,
        [EntityID] = @EntityID,
        [URLFormat] = @URLFormat
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwIntegrationURLFormats] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueryFields]'
GO


CREATE VIEW [__mj].[vwQueryFields]
AS
SELECT 
    q.*,
    Query_QueryID.[Name] AS [Query],
    Entity_SourceEntityID.[Name] AS [SourceEntity]
FROM
    [__mj].[QueryField] AS q
INNER JOIN
    [__mj].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_SourceEntityID
  ON
    [q].[SourceEntityID] = Entity_SourceEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEmployeeSkills]'
GO


CREATE VIEW [__mj].[vwEmployeeSkills]
AS
SELECT 
    e.*,
    Skill_SkillID.[Name] AS [Skill]
FROM
    [__mj].[EmployeeSkill] AS e
INNER JOIN
    [__mj].[Skill] AS Skill_SkillID
  ON
    [e].[SkillID] = Skill_SkillID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecordMergeLogs]'
GO


CREATE VIEW [__mj].[vwRecordMergeLogs]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_InitiatedByUserID.[Name] AS [InitiatedByUser]
FROM
    [__mj].[RecordMergeLog] AS r
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[User] AS User_InitiatedByUserID
  ON
    [r].[InitiatedByUserID] = User_InitiatedByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwSkills]'
GO


CREATE VIEW [__mj].[vwSkills]
AS
SELECT 
    s.*,
    Skill_ParentID.[Name] AS [Parent]
FROM
    [__mj].[Skill] AS s
LEFT OUTER JOIN
    [__mj].[Skill] AS Skill_ParentID
  ON
    [s].[ParentID] = Skill_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUsers]'
GO

CREATE VIEW [__mj].[vwUsers] 
AS
SELECT 
	u.*,
	u.FirstName + ' ' + u.LastName FirstLast,
	e.FirstLast EmployeeFirstLast,
	e.Email EmployeeEmail,
	e.Title EmployeeTitle,
	e.Supervisor EmployeeSupervisor,
	e.SupervisorEmail EmployeeSupervisorEmail
FROM 
	[__mj].[User] u
LEFT OUTER JOIN
	vwEmployees e
ON
	u.EmployeeID = e.ID

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecordMergeDeletionLogs]'
GO


CREATE VIEW [__mj].[vwRecordMergeDeletionLogs]
AS
SELECT 
    r.*
FROM
    [__mj].[RecordMergeDeletionLog] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRole]'
GO


CREATE PROCEDURE [__mj].[spCreateRole]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DirectoryID nvarchar(250),
    @SQLName nvarchar(250)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Role]
        (
            [Name],
            [Description],
            [DirectoryID],
            [SQLName]
        )
    VALUES
        (
            @Name,
            @Description,
            @DirectoryID,
            @SQLName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRoles] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateSchemaInfo]'
GO


CREATE PROCEDURE [__mj].[spCreateSchemaInfo]
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[SchemaInfo]
        (
            [SchemaName],
            [EntityIDMin],
            [EntityIDMax],
            [Comments]
        )
    VALUES
        (
            @SchemaName,
            @EntityIDMin,
            @EntityIDMax,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwSchemaInfos] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateIntegration]'
GO


CREATE PROCEDURE [__mj].[spUpdateIntegration]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(255),
    @NavigationBaseURL nvarchar(500),
    @ClassName nvarchar(100),
    @ImportPath nvarchar(100),
    @BatchMaxRequestCount int,
    @BatchRequestWaitTime int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Integration]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [NavigationBaseURL] = @NavigationBaseURL,
        [ClassName] = @ClassName,
        [ImportPath] = @ImportPath,
        [BatchMaxRequestCount] = @BatchMaxRequestCount,
        [BatchRequestWaitTime] = @BatchRequestWaitTime,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwIntegrations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserRecordLogs]'
GO

CREATE VIEW [__mj].[vwUserRecordLogs] 
AS
SELECT 
	ur.*,
	e.Name Entity,
	u.Name UserName,
	u.FirstLast UserFirstLast,
	u.Email UserEmail,
	u.EmployeeSupervisor UserSupervisor,
	u.EmployeeSupervisorEmail UserSupervisorEmail
FROM
	__mj.UserRecordLog ur
INNER JOIN
	__mj.Entity e 
ON
	ur.EntityID = e.ID
INNER JOIN
	vwUsers u
ON
	ur.UserID = u.ID


GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRecordMap]'
GO


CREATE PROCEDURE [__mj].[spCreateCompanyIntegrationRecordMap]
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @EntityID int,
    @EntityRecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[CompanyIntegrationRecordMap]
        (
            [CompanyIntegrationID],
            [ExternalSystemRecordID],
            [EntityID],
            [EntityRecordID]
        )
    VALUES
        (
            @CompanyIntegrationID,
            @ExternalSystemRecordID,
            @EntityID,
            @EntityRecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrationRecordMaps] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployeeSkill]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployeeSkill]
    @ID int,
    @EmployeeID int,
    @SkillID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeSkill]
    SET 
        [EmployeeID] = @EmployeeID,
        [SkillID] = @SkillID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEmployeeSkills] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserViews]'
GO

CREATE VIEW [__mj].[vwUserViews]
AS
SELECT 
	uv.*,
	u.Name UserName,
	u.FirstLast UserFirstLast,
	u.Email UserEmail,
	u.Type UserType,
	e.Name Entity,
	e.BaseView EntityBaseView
FROM
	__mj.UserView uv
INNER JOIN
	[__mj].vwUsers u
ON
	uv.UserID = u.ID
INNER JOIN
	__mj.Entity e
ON
	uv.EntityID = e.ID


GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueryField]'
GO


CREATE PROCEDURE [__mj].[spCreateQueryField]
    @QueryID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID int,
    @SourceFieldName nvarchar(255),
    @IsComputed bit,
    @ComputationDescription nvarchar(MAX),
    @IsSummary bit,
    @SummaryDescription nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[QueryField]
        (
            [QueryID],
            [Name],
            [Description],
            [Sequence],
            [SQLBaseType],
            [SQLFullType],
            [SourceEntityID],
            [SourceFieldName],
            [IsComputed],
            [ComputationDescription],
            [IsSummary],
            [SummaryDescription]
        )
    VALUES
        (
            @QueryID,
            @Name,
            @Description,
            @Sequence,
            @SQLBaseType,
            @SQLFullType,
            @SourceEntityID,
            @SourceFieldName,
            @IsComputed,
            @ComputationDescription,
            @IsSummary,
            @SummaryDescription
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueryFields] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRole]'
GO


CREATE PROCEDURE [__mj].[spUpdateRole]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DirectoryID nvarchar(250),
    @SQLName nvarchar(250)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Role]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DirectoryID] = @DirectoryID,
        [SQLName] = @SQLName,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwRoles] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwApplicationEntities]'
GO

CREATE VIEW [__mj].[vwApplicationEntities]
AS
SELECT 
   ae.*,
   a.Name Application,
   e.Name Entity,
   e.BaseTable EntityBaseTable,
   e.CodeName EntityCodeName,
   e.ClassName EntityClassName,
   e.BaseTableCodeName EntityBaseTableCodeName
FROM
   __mj.ApplicationEntity ae
INNER JOIN
   __mj.Application a
ON
   ae.ApplicationName = a.Name
INNER JOIN
   [__mj].vwEntities e
ON
   ae.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordMergeLog]'
GO


CREATE PROCEDURE [__mj].[spCreateRecordMergeLog]
    @EntityID int,
    @SurvivingRecordID nvarchar(255),
    @InitiatedByUserID int,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID int,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetime,
    @ProcessingEndedAt datetime,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[RecordMergeLog]
        (
            [EntityID],
            [SurvivingRecordID],
            [InitiatedByUserID],
            [ApprovalStatus],
            [ApprovedByUserID],
            [ProcessingStatus],
            [ProcessingStartedAt],
            [ProcessingEndedAt],
            [ProcessingLog],
            [Comments]
        )
    VALUES
        (
            @EntityID,
            @SurvivingRecordID,
            @InitiatedByUserID,
            @ApprovalStatus,
            @ApprovedByUserID,
            @ProcessingStatus,
            @ProcessingStartedAt,
            @ProcessingEndedAt,
            @ProcessingLog,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordMergeLogs] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteRole]'
GO


CREATE PROCEDURE [__mj].[spDeleteRole]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Role]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserApplications]'
GO


CREATE VIEW [__mj].[vwUserApplications]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User],
    Application_ApplicationID.[Name] AS [Application]
FROM
    [__mj].[UserApplication] AS u
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
INNER JOIN
    [__mj].[Application] AS Application_ApplicationID
  ON
    [u].[ApplicationID] = Application_ApplicationID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserApplicationEntities]'
GO

CREATE VIEW [__mj].[vwUserApplicationEntities]
AS
SELECT 
   uae.*,
   ua.[Application] Application,
   ua.[User] [User],
   e.Name Entity
FROM
   __mj.UserApplicationEntity uae
INNER JOIN
   [__mj].vwUserApplications ua
ON
   uae.UserApplicationID = ua.ID
INNER JOIN
   __mj.Entity e
ON
   uae.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordMergeDeletionLog]'
GO


CREATE PROCEDURE [__mj].[spCreateRecordMergeDeletionLog]
    @RecordMergeLogID int,
    @DeletedRecordID nvarchar(255),
    @Status nvarchar(10),
    @ProcessingLog nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[RecordMergeDeletionLog]
        (
            [RecordMergeLogID],
            [DeletedRecordID],
            [Status],
            [ProcessingLog]
        )
    VALUES
        (
            @RecordMergeLogID,
            @DeletedRecordID,
            @Status,
            @ProcessingLog
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordMergeDeletionLogs] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegration]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegration]
    @ID int,
    @CompanyName nvarchar(50),
    @IntegrationName nvarchar(100),
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetime,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegration]
    SET 
        [CompanyName] = @CompanyName,
        [IntegrationName] = @IntegrationName,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [UpdatedAt] = GETDATE(),
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwWorkflows]'
GO


CREATE VIEW [__mj].[vwWorkflows]
AS
SELECT 
    w.*,
	AutoRunInterval * (CASE AutoRunIntervalUnits
        WHEN 'Minutes' THEN 1
        WHEN 'Hours' THEN 60 -- 60 minutes in an hour
        WHEN 'Days' THEN 60 * 24 -- 1440 minutes in a day
        WHEN 'Weeks' THEN 60 * 24 * 7 -- 10080 minutes in a week
        WHEN 'Months' THEN 60 * 24 * 30 -- Approximately 43200 minutes in a month
        ELSE 0 END) AS AutoRunIntervalMinutes
FROM
    [__mj].[Workflow] AS w
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwWorkflowRuns]'
GO

CREATE VIEW [__mj].[vwWorkflowRuns]
AS
SELECT 
  wr.*,
  w.Name Workflow,
  w.WorkflowEngineName
FROM
  __mj.WorkflowRun wr
INNER JOIN
  [__mj].vwWorkflows w
ON
  wr.WorkflowName = w.Name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateSchemaInfo]'
GO


CREATE PROCEDURE [__mj].[spUpdateSchemaInfo]
    @ID int,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[SchemaInfo]
    SET 
        [SchemaName] = @SchemaName,
        [EntityIDMin] = @EntityIDMin,
        [EntityIDMax] = @EntityIDMax,
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwSchemaInfos] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUser]'
GO


CREATE PROCEDURE [__mj].[spCreateUser]
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit,
    @LinkedRecordType nchar(10),
    @EmployeeID int,
    @LinkedEntityID int,
    @LinkedEntityRecordID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[User]
        (
            [Name],
            [FirstName],
            [LastName],
            [Title],
            [Email],
            [Type],
            [IsActive],
            [LinkedRecordType],
            [EmployeeID],
            [LinkedEntityID],
            [LinkedEntityRecordID]
        )
    VALUES
        (
            @Name,
            @FirstName,
            @LastName,
            @Title,
            @Email,
            @Type,
            @IsActive,
            @LinkedRecordType,
            @EmployeeID,
            @LinkedEntityID,
            @LinkedEntityRecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserViewRunDetails]'
GO

CREATE VIEW [__mj].[vwUserViewRunDetails]
AS
SELECT 
    u.*,
	uv.ID UserViewID,
	uv.EntityID
FROM
    [__mj].[UserViewRunDetail] AS u
INNER JOIN
	[__mj].[UserViewRun] as uvr
  ON
    u.UserViewRunID = uvr.ID
INNER JOIN
    [__mj].[UserView] uv
  ON
    uvr.UserViewID = uv.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRecordMap]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRecordMap]
    @ID int,
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @EntityID int,
    @EntityRecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRecordMap]
    SET 
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [EntityID] = @EntityID,
        [EntityRecordID] = @EntityRecordID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrationRecordMaps] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntity]'
GO


CREATE PROCEDURE [__mj].[spCreateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport]
        )
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecordChanges]'
GO


CREATE VIEW [__mj].[vwRecordChanges]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[RecordChange] AS r
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordChange]'
GO

CREATE PROCEDURE [__mj].[spCreateRecordChange]
    @EntityName nvarchar(100),
    @RecordID NVARCHAR(255),
	@UserID int,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nchar(15),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO 
    [__mj].[RecordChange]
        (
            EntityID,
            RecordID,
			UserID,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    VALUES
        (
            (SELECT ID FROM __mj.Entity WHERE Name = @EntityName),
            @RecordID,
			@UserID,
            GETDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments
        )

    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].vwRecordChanges WHERE ID = SCOPE_IDENTITY()
END




GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueryField]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueryField]
    @ID int,
    @QueryID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID int,
    @SourceFieldName nvarchar(255),
    @IsComputed bit,
    @ComputationDescription nvarchar(MAX),
    @IsSummary bit,
    @SummaryDescription nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryField]
    SET 
        [QueryID] = @QueryID,
        [Name] = @Name,
        [Description] = @Description,
        [Sequence] = @Sequence,
        [SQLBaseType] = @SQLBaseType,
        [SQLFullType] = @SQLFullType,
        [SourceEntityID] = @SourceEntityID,
        [SourceFieldName] = @SourceFieldName,
        [IsComputed] = @IsComputed,
        [ComputationDescription] = @ComputationDescription,
        [IsSummary] = @IsSummary,
        [SummaryDescription] = @SummaryDescription,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwQueryFields] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityField]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityField]
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID int,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityField]
        (
            [DisplayName],
            [Description],
            [AutoUpdateDescription],
            [IsPrimaryKey],
            [IsUnique],
            [Category],
            [ValueListType],
            [ExtendedType],
            [DefaultInView],
            [ViewCellTemplate],
            [DefaultColumnWidth],
            [AllowUpdateAPI],
            [AllowUpdateInView],
            [IncludeInUserSearchAPI],
            [FullTextSearchEnabled],
            [UserSearchParamFormatAPI],
            [IncludeInGeneratedForm],
            [GeneratedFormSection],
            [IsNameField],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IncludeRelatedEntityNameFieldInBaseView],
            [RelatedEntityNameFieldMap]
        )
    VALUES
        (
            @DisplayName,
            @Description,
            @AutoUpdateDescription,
            @IsPrimaryKey,
            @IsUnique,
            @Category,
            @ValueListType,
            @ExtendedType,
            @DefaultInView,
            @ViewCellTemplate,
            @DefaultColumnWidth,
            @AllowUpdateAPI,
            @AllowUpdateInView,
            @IncludeInUserSearchAPI,
            @FullTextSearchEnabled,
            @UserSearchParamFormatAPI,
            @IncludeInGeneratedForm,
            @GeneratedFormSection,
            @IsNameField,
            @RelatedEntityID,
            @RelatedEntityFieldName,
            @IncludeRelatedEntityNameFieldInBaseView,
            @RelatedEntityNameFieldMap
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityPermissions]'
GO


CREATE VIEW [__mj].[vwEntityPermissions]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
	Role_RoleName.[SQLName] as [RoleSQLName], -- custom bit here to add in this field for vwEntityPermissions
	rlsC.Name as [CreateRLSFilter],
	rlsR.Name as [ReadRLSFilter],
	rlsU.Name as [UpdateRLSFilter],
	rlsD.Name as [DeleteRLSFilter]
FROM
    [__mj].[EntityPermission] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[Role] AS Role_RoleName
  ON
    [e].[RoleName] = Role_RoleName.[Name]
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsC
  ON
    [e].CreateRLSFilterID = rlsC.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsR
  ON
    [e].ReadRLSFilterID = rlsR.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsU
  ON
    [e].UpdateRLSFilterID = rlsU.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsD
  ON
    [e].DeleteRLSFilterID = rlsD.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRecordMergeDeletionLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordMergeDeletionLog]
    @ID int,
    @RecordMergeLogID int,
    @DeletedRecordID nvarchar(255),
    @Status nvarchar(10),
    @ProcessingLog nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeDeletionLog]
    SET 
        [RecordMergeLogID] = @RecordMergeLogID,
        [DeletedRecordID] = @DeletedRecordID,
        [Status] = @Status,
        [ProcessingLog] = @ProcessingLog,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwRecordMergeDeletionLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityRelationship]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityRelationship]
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityRelationship]
        (
            [EntityID],
            [Sequence],
            [RelatedEntityID],
            [BundleInAPI],
            [IncludeInParentAllQuery],
            [Type],
            [EntityKeyField],
            [RelatedEntityJoinField],
            [JoinView],
            [JoinEntityJoinField],
            [JoinEntityInverseJoinField],
            [DisplayInForm],
            [DisplayName]
        )
    VALUES
        (
            @EntityID,
            @Sequence,
            @RelatedEntityID,
            @BundleInAPI,
            @IncludeInParentAllQuery,
            @Type,
            @EntityKeyField,
            @RelatedEntityJoinField,
            @JoinView,
            @JoinEntityJoinField,
            @JoinEntityInverseJoinField,
            @DisplayInForm,
            @DisplayName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRelationships] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRecordMergeLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordMergeLog]
    @ID int,
    @EntityID int,
    @SurvivingRecordID nvarchar(255),
    @InitiatedByUserID int,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID int,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetime,
    @ProcessingEndedAt datetime,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeLog]
    SET 
        [EntityID] = @EntityID,
        [SurvivingRecordID] = @SurvivingRecordID,
        [InitiatedByUserID] = @InitiatedByUserID,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingStartedAt] = @ProcessingStartedAt,
        [ProcessingEndedAt] = @ProcessingEndedAt,
        [ProcessingLog] = @ProcessingLog,
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwRecordMergeLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUser]'
GO


CREATE PROCEDURE [__mj].[spUpdateUser]
    @ID int,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit,
    @LinkedRecordType nchar(10),
    @EmployeeID int,
    @LinkedEntityID int,
    @LinkedEntityRecordID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[User]
    SET 
        [Name] = @Name,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Type] = @Type,
        [IsActive] = @IsActive,
        [LinkedRecordType] = @LinkedRecordType,
        [EmployeeID] = @EmployeeID,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedEntityRecordID] = @LinkedEntityRecordID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewRunWithDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewRunWithDetail](@UserViewID INT, @UserEmail NVARCHAR(255), @RecordIDList __mj.IDListTableType READONLY) 
AS
DECLARE @RunID INT
DECLARE @Now DATETIME
SELECT @Now=GETDATE()
DECLARE @outputTable TABLE (ID INT, UserViewID INT, RunAt DATETIME, RunByUserID INT, UserView NVARCHAR(100), RunByUser NVARCHAR(100))
DECLARE @UserID INT
SELECT @UserID=ID FROM vwUsers WHERE Email=@UserEmail
INSERT INTO @outputTable
EXEC spCreateUserViewRun @UserViewID=@UserViewID,@RunAt=@Now,@RunByUserID=@UserID
SELECT @RunID = ID FROM @outputTable
INSERT INTO __mj.UserViewRunDetail 
(
    UserViewRunID,
    RecordID
)
(
    SELECT @RunID, ID FROM @RecordIDList
)
SELECT @RunID 'UserViewRunID'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueryCategories]'
GO


CREATE VIEW [__mj].[vwQueryCategories]
AS
SELECT 
    q.*,
    QueryCategory_ParentID.[Name] AS [Parent]
FROM
    [__mj].[QueryCategory] AS q
LEFT OUTER JOIN
    [__mj].[QueryCategory] AS QueryCategory_ParentID
  ON
    [q].[ParentID] = QueryCategory_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntity]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Entity]
    SET 
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueryPermissions]'
GO


CREATE VIEW [__mj].[vwQueryPermissions]
AS
SELECT 
    q.*
FROM
    [__mj].[QueryPermission] AS q
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityField]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityField]
    @ID int,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID int,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityField]
    SET 
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spGetNextEntityID]'
GO

CREATE PROC [__mj].[spGetNextEntityID]
    @schemaName NVARCHAR(255)
AS
BEGIN
    DECLARE @EntityIDMin INT;
    DECLARE @EntityIDMax INT;
    DECLARE @MaxEntityID INT;
	DECLARE @NextID INT;

    -- STEP 1: Get EntityIDMin and EntityIDMax from __mj.SchemaInfo
    SELECT 
		@EntityIDMin = EntityIDMin, @EntityIDMax = EntityIDMax
    FROM 
		__mj.SchemaInfo
    WHERE 
		SchemaName = @schemaName;

    -- STEP 2: If no matching schemaName, insert a new row into __mj.SchemaInfo
    IF @EntityIDMin IS NULL OR @EntityIDMax IS NULL
    BEGIN
        -- Get the maximum ID from the __mj.Entity table
		DECLARE @MaxEntityIDFromSchema INT;
        SELECT @MaxEntityID = ISNULL(MAX(ID), 0) FROM __mj.Entity;
		SELECT @MaxEntityIDFromSchema = ISNULL(MAX(EntityIDMax),0) FROM __mj.SchemaInfo;
		IF @MaxEntityIDFromSchema > @MaxEntityID 
			SELECT @MaxEntityID = @MaxEntityIDFromSchema; -- use the max ID From the schema info table if it is higher

        -- Calculate the new EntityIDMin
        SET @EntityIDMin = CASE 
                              WHEN @MaxEntityID >= 25000001 THEN @MaxEntityID + 1
                              ELSE 25000001
                            END;

        -- Calculate the new EntityIDMax
        SET @EntityIDMax = @EntityIDMin + 24999;

        -- Insert the new row into __mj.SchemaInfo
        INSERT INTO __mj.SchemaInfo (SchemaName, EntityIDMin, EntityIDMax)
        VALUES (@schemaName, @EntityIDMin, @EntityIDMax);
    END

    -- STEP 3: Get the maximum ID currently in the __mj.Entity table within the range
    SELECT 
		@NextID = ISNULL(MAX(ID), @EntityIDMin - 1) -- we subtract 1 from entityIDMin as it will be used the first time if Max(EntityID) is null, and below we will increment it by one to be the first ID in that range
    FROM 
		__mj.Entity
    WHERE 
		ID BETWEEN @EntityIDMin AND @EntityIDMax

    -- STEP 4: Increment to get the next ID
    SET @NextID = @NextID + 1;

    -- STEP 5: Check if the next ID is within the allowed range for the schema in question
    IF @NextID > @EntityIDMax
		BEGIN
			SELECT -1 AS NextID -- calling code needs to konw this is an invalid condition
		END
	ELSE
		SELECT @NextID AS NextID
END;

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueries]'
GO


CREATE VIEW [__mj].[vwQueries]
AS
SELECT 
    q.*,
    QueryCategory_CategoryID.[Name] AS [Category]
FROM
    [__mj].[Query] AS q
LEFT OUTER JOIN
    [__mj].[QueryCategory] AS QueryCategory_CategoryID
  ON
    [q].[CategoryID] = QueryCategory_CategoryID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityRelationship]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityRelationship]
    @ID int,
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayName] = @DisplayName,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityRelationships] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwSQLTablesAndEntities]'
GO

CREATE VIEW [__mj].[vwSQLTablesAndEntities]
AS
SELECT 
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.*,
	v.object_id view_object_id,
	v.name ViewName,
    EP_Table.value AS TableDescription, -- Join with sys.extended_properties to get the table description
    EP_View.value AS ViewDescription, -- Join with sys.extended_properties to get the view description
	COALESCE(EP_View.value, EP_Table.value) AS EntityDescription -- grab the view description first and if that doesn't exist, grab the table description and we'll use this as the description for the entity
FROM 
	sys.all_objects t
INNER JOIN
	sys.schemas s 
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	__mj.Entity e 
ON
	t.name = e.BaseTable AND
	s.name = e.SchemaName 
LEFT OUTER JOIN
	sys.all_objects v
ON
	e.BaseView = v.name AND 
	v.type = 'V' 
LEFT OUTER JOIN
    sys.schemas s_v
ON   
    v.schema_id = s_v.schema_id
LEFT OUTER JOIN
    sys.extended_properties EP_Table
ON
    EP_Table.major_id = t.object_id
    AND EP_Table.minor_id = 0
    AND EP_Table.name = 'MS_Description'
LEFT OUTER JOIN
    sys.extended_properties EP_View
ON
    EP_View.major_id = v.object_id
    AND EP_View.minor_id = 0
    AND EP_View.name = 'MS_Description'
WHERE   
    (s_v.name = e.SchemaName OR s_v.name IS NULL) AND
	( t.TYPE = 'U' OR (t.Type='V' AND e.VirtualEntity=1)) -- TABLE - non-virtual entities 
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityDocumentTypes]'
GO


CREATE VIEW [__mj].[vwEntityDocumentTypes]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityDocumentType] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUser]'
GO


CREATE PROCEDURE [__mj].[spDeleteUser]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[User]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwSQLColumnsAndEntityFields]'
GO

CREATE VIEW [__mj].[vwSQLColumnsAndEntityFields]
AS
SELECT 
	e.EntityID,
	e.EntityName Entity,
	e.SchemaName,
	e.TableName TableName,
	ef.ID EntityFieldID,
	ef.Sequence EntityFieldSequence,
	ef.Name EntityFieldName,
	c.column_id Sequence,
	c.name FieldName,
	COALESCE(bt.name, t.name) Type, -- get the type from the base type (bt) if it exists, this is in the case of a user-defined type being used, t.name would be the UDT name.
	IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType, -- we have a user defined type, so pass that to the view caller too
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity) AutoIncrement,
	c.column_id,
	IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- updated so that we take into account that computed columns are virtual always, previously only looked for existence of a column in table vs. a view
	basetable_columns.object_id,
	dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
	cc.definition ComputedColumnDefinition,
	COALESCE(EP_View.value, EP_Table.value) AS [Description], -- Dynamically choose description - first look at view level if a description was defined there (rare) and then go to table if it was defined there (often not there either)
	EP_View.value AS ViewColumnDescription,
	EP_Table.value AS TableColumnDescription
FROM
	sys.all_columns c
INNER JOIN
	[__mj].vwSQLTablesAndEntities e
ON
	c.object_id = IIF(e.view_object_id IS NULL, e.object_id, e.view_object_id)
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
LEFT OUTER JOIN
    sys.types bt
ON
    t.system_type_id = bt.user_type_id AND t.is_user_defined = 1 -- Join to fetch base type for UDTs
INNER JOIN
	sys.all_objects basetable 
ON
	e.object_id = basetable.object_id
LEFT OUTER JOIN 
    sys.computed_columns cc 
ON 
	e.object_id = cc.object_id AND 
	c.name = cc.name
LEFT OUTER JOIN
	sys.all_columns basetable_columns -- join in all columns from base table and line them up - that way we know if a field is a VIEW only field or a TABLE field (virtual vs. in table)
ON
	basetable.object_id = basetable_columns.object_id AND
	c.name = basetable_columns.name 
LEFT OUTER JOIN
	__mj.EntityField ef 
ON
	e.EntityID = ef.EntityID AND
	c.name = ef.Name
LEFT OUTER JOIN 
    sys.default_constraints dc 
ON 
    e.object_id = dc.parent_object_id AND
	c.column_id = dc.parent_column_id
LEFT OUTER JOIN 
    sys.extended_properties EP_Table 
ON 
	EP_Table.major_id = basetable_columns.object_id AND 
	EP_Table.minor_id = basetable_columns.column_id AND 
	EP_Table.name = 'MS_Description'
LEFT OUTER JOIN 
    sys.extended_properties EP_View 
ON 
	EP_View.major_id = c.object_id AND 
	EP_View.minor_id = c.column_id AND 
	EP_View.name = 'MS_Description'
WHERE 
	c.default_object_id IS NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwVectorIndexes]'
GO


CREATE VIEW [__mj].[vwVectorIndexes]
AS
SELECT 
    v.*,
    VectorDatabase_VectorDatabaseID.[Name] AS [VectorDatabase],
    AIModel_EmbeddingModelID.[Name] AS [EmbeddingModel]
FROM
    [__mj].[VectorIndex] AS v
INNER JOIN
    [__mj].[VectorDatabase] AS VectorDatabase_VectorDatabaseID
  ON
    [v].[VectorDatabaseID] = VectorDatabase_VectorDatabaseID.[ID]
INNER JOIN
    [__mj].[AIModel] AS AIModel_EmbeddingModelID
  ON
    [v].[EmbeddingModelID] = AIModel_EmbeddingModelID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntity]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntity]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Entity]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUnneededEntityFields]'
GO

CREATE PROC [__mj].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX)

AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT 
	ef.* 
INTO 
	#ef_spDeleteUnneededEntityFields 
FROM 
	vwEntityFields ef
INNER JOIN
	vwEntities e
ON 
	ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded


SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields   

-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE __mj.Entity SET UpdatedAt=GETDATE() WHERE ID IN
(
	SELECT 
	  ef.EntityID 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  
)

-- now delete the entity fields themsevles
DELETE FROM __mj.EntityField WHERE ID IN
(
	SELECT 
	  ef.ID 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  
)

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueryCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateQueryCategory]
    @Name nvarchar(50),
    @ParentID int,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[QueryCategory]
        (
            [Name],
            [ParentID],
            [Description]
        )
    VALUES
        (
            @Name,
            @ParentID,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueryCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityField]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityField]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityField]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateExistingEntitiesFromSchema]'
GO


CREATE PROCEDURE [__mj].[spUpdateExistingEntitiesFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    -- Update statement excluding rows with matching SchemaName
    UPDATE 
        [__mj].[Entity]
    SET
        Description = IIF(e.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.EntityDescription), e.Description)
    FROM
        [__mj].[Entity] e
    INNER JOIN
        [__mj].[vwSQLTablesAndEntities] fromSQL
    ON
        e.ID = fromSQL.EntityID
    -- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
    LEFT JOIN
        STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
    ON
        fromSQL.SchemaName = excludedSchemas.value
    WHERE
        excludedSchemas.value IS NULL; -- This ensures rows with matching SchemaName are excluded
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueryPermission]'
GO


CREATE PROCEDURE [__mj].[spCreateQueryPermission]
    @QueryID int,
    @RoleName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[QueryPermission]
        (
            [QueryID],
            [RoleName]
        )
    VALUES
        (
            @QueryID,
            @RoleName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueryPermissions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityRelationship]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityRelationship]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityRelationship]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTableUniqueKeys]'
GO

CREATE VIEW [__mj].[vwTableUniqueKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM 
    sys.tables t
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN 
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN 
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE 
    i.is_unique = 1
    AND i.is_primary_key = 0;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTablePrimaryKeys]'
GO
 
CREATE VIEW [__mj].[vwTablePrimaryKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM 
    sys.tables t
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN 
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN 
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE 
    i.is_primary_key = 1;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwForeignKeys]'
GO

CREATE VIEW [__mj].[vwForeignKeys]
AS
SELECT  obj.name AS FK_NAME,
    sch.name AS [schema_name],
    tab1.name AS [table],
    col1.name AS [column],
	sch2.name AS [referenced_schema],
    tab2.name AS [referenced_table],
    col2.name AS [referenced_column]
FROM sys.foreign_key_columns fkc
INNER JOIN sys.objects obj
    ON obj.object_id = fkc.constraint_object_id
INNER JOIN sys.tables tab1
    ON tab1.object_id = fkc.parent_object_id
INNER JOIN sys.schemas sch
    ON tab1.schema_id = sch.schema_id
INNER JOIN sys.columns col1
    ON col1.column_id = parent_column_id AND col1.object_id = tab1.object_id
INNER JOIN sys.tables tab2
    ON tab2.object_id = fkc.referenced_object_id
INNER JOIN sys.columns col2
    ON col2.column_id = referenced_column_id AND col2.object_id = tab2.object_id
INNER JOIN sys.schemas sch2
    ON tab2.schema_id = sch2.schema_id
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateExistingEntityFieldsFromSchema]'
GO

CREATE PROC [__mj].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    -- Update Statement
    UPDATE [__mj].EntityField
    SET
		Description = IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.Description), ef.Description),
        Type = fromSQL.Type,
        Length = fromSQL.Length,
        Precision = fromSQL.Precision,
        Scale = fromSQL.Scale,
        AllowsNull = fromSQL.AllowsNull,
        DefaultValue = fromSQL.DefaultValue,
        AutoIncrement = fromSQL.AutoIncrement,
        IsVirtual = fromSQL.IsVirtual,
        Sequence = fromSQL.Sequence,
        RelatedEntityID = re.ID,
        RelatedEntityFieldName = fk.referenced_column,
        IsPrimaryKey =	CASE 
							WHEN pk.ColumnName IS NOT NULL THEN 1 
							ELSE 0 
						END,
        IsUnique =		CASE 
							WHEN pk.ColumnName IS NOT NULL THEN 1 
							ELSE 
								CASE 
									WHEN uk.ColumnName IS NOT NULL THEN 1 
									ELSE 0 
								END 
						END,
        UpdatedAt = GETDATE()
    FROM
        [__mj].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
    ON
        ef.EntityID = fromSQL.EntityID AND
        ef.Name = fromSQL.FieldName
    INNER JOIN
        [__mj].Entity e 
    ON
        ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
    ON
        ef.Name = fk.[column] AND
        e.BaseTable = fk.[table] AND
		e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN 
        [__mj].Entity re -- Related Entity
    ON
        re.BaseTable = fk.referenced_table AND
		re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN 
		[__mj].vwTablePrimaryKeys pk
    ON
        e.BaseTable = pk.TableName AND
        ef.Name = pk.ColumnName AND
        e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN 
		[__mj].vwTableUniqueKeys uk
    ON
        e.BaseTable = uk.TableName AND
        ef.Name = uk.ColumnName AND
        e.SchemaName = uk.SchemaName
    -- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
    LEFT JOIN
        STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
    ON
        e.SchemaName = excludedSchemas.value
	WHERE
		fromSQL.EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
		AND
        excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateVectorIndex]'
GO


CREATE PROCEDURE [__mj].[spCreateVectorIndex]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID int,
    @EmbeddingModelID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[VectorIndex]
        (
            [Name],
            [Description],
            [VectorDatabaseID],
            [EmbeddingModelID]
        )
    VALUES
        (
            @Name,
            @Description,
            @VectorDatabaseID,
            @EmbeddingModelID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwVectorIndexes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwErrorLogs]'
GO


CREATE VIEW [__mj].[vwErrorLogs]
AS
SELECT 
    e.*
FROM
    [__mj].[ErrorLog] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityFieldValues]'
GO


CREATE VIEW [__mj].[vwEntityFieldValues]
AS
SELECT 
    efv.*,
    EntityField_EntityID.[Name] AS [EntityField],
    EntityField_EntityID.[Entity] AS [Entity]
FROM
    [__mj].[EntityFieldValue] AS efv
INNER JOIN
    [__mj].[vwEntityFields] AS EntityField_EntityID
  ON
    [efv].[EntityID] = EntityField_EntityID.[EntityID] AND
	efv.EntityFieldName = EntityField_EntityID.Name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQuery]'
GO


CREATE PROCEDURE [__mj].[spCreateQuery]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @SQL nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Query]
        (
            [Name],
            [Description],
            [CategoryID],
            [SQL],
            [OriginalSQL],
            [Feedback],
            [Status],
            [QualityRank]
        )
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @SQL,
            @OriginalSQL,
            @Feedback,
            @Status,
            @QualityRank
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueries] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserRecordLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserRecordLog]
    @ID int,
    @UserID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @EarliestAt datetime,
    @LatestAt datetime,
    @TotalCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserRecordLog]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EarliestAt] = @EarliestAt,
        [LatestAt] = @LatestAt,
        [TotalCount] = @TotalCount
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserRecordLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwVersionInstallations]'
GO


CREATE VIEW [__mj].[vwVersionInstallations]
AS
SELECT 
    v.*,
	CONVERT(nvarchar(100),v.MajorVersion) + '.' + CONVERT(nvarchar(100),v.MinorVersion) + '.' + CONVERT(nvarchar(100),v.PatchVersion,100) AS CompleteVersion
FROM
    [__mj].[VersionInstallation] AS v
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityDocumentType]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocumentType]
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityDocumentType]
        (
            [Name],
            [Description]
        )
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserView]'
GO


CREATE PROCEDURE [__mj].[spCreateUserView]
    @UserID int,
    @EntityID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID int,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserView]
        (
            [UserID],
            [EntityID],
            [Name],
            [Description],
            [CategoryID],
            [IsShared],
            [IsDefault],
            [GridState],
            [FilterState],
            [CustomFilterState],
            [SmartFilterEnabled],
            [SmartFilterPrompt],
            [SmartFilterWhereClause],
            [SmartFilterExplanation],
            [WhereClause],
            [CustomWhereClause],
            [SortState]
        )
    VALUES
        (
            @UserID,
            @EntityID,
            @Name,
            @Description,
            @CategoryID,
            @IsShared,
            @IsDefault,
            @GridState,
            @FilterState,
            @CustomFilterState,
            @SmartFilterEnabled,
            @SmartFilterPrompt,
            @SmartFilterWhereClause,
            @SmartFilterExplanation,
            @WhereClause,
            @CustomWhereClause,
            @SortState
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViews] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueryCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueryCategory]
    @ID int,
    @Name nvarchar(50),
    @ParentID int,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryCategory]
    SET 
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwQueryCategories] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRunDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRunDetail]
    @ID int,
    @CompanyIntegrationRunID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @Action nchar(20),
    @ExecutedAt datetime,
    @IsSuccess bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRunDetail]
    SET 
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Action] = @Action,
        [ExecutedAt] = @ExecutedAt,
        [IsSuccess] = @IsSuccess
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrationRunDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spSetDefaultColumnWidthWhereNeeded]'
GO

CREATE PROC [__mj].[spSetDefaultColumnWidthWhereNeeded]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
/**************************************************************************************/
/* Generate default column widths for columns that don't have a width set*/
/**************************************************************************************/

UPDATE
	ef 
SET 
	DefaultColumnWidth =  
	IIF(ef.Type = 'int', 50, 
		IIF(ef.Type = 'datetimeoffset', 100,
			IIF(ef.Type = 'money', 100, 
				IIF(ef.Type ='nchar', 75,
					150)))
		), 
	UpdatedAt = GETDATE()
FROM 
	__mj.EntityField ef
INNER JOIN
	__mj.Entity e
ON
	ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    ef.DefaultColumnWidth IS NULL AND
	excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueryPermission]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueryPermission]
    @ID int,
    @QueryID int,
    @RoleName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryPermission]
    SET 
        [QueryID] = @QueryID,
        [RoleName] = @RoleName,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwQueryPermissions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrationRuns]'
GO


CREATE VIEW [__mj].[vwCompanyIntegrationRuns]
AS
SELECT 
    c.*,
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [__mj].[CompanyIntegrationRun] AS c
INNER JOIN
    [__mj].[User] AS User_RunByUserID
  ON
    [c].[RunByUserID] = User_RunByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteConversation]'
GO

CREATE PROCEDURE [__mj].[spDeleteConversation]
    @ID INT
AS  
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Report - set FK to null before deleting rows in Conversation
    UPDATE 
        [__mj].[Report] 
    SET 
        [ConversationID] = NULL 
    WHERE 
        [ConversationID] = @ID

	UPDATE 
        [__mj].[Report] 
    SET 
        [ConversationDetailID] = NULL 
    WHERE 
        [ConversationDetailID] IN (SELECT ID FROM __mj.ConversationDetail WHERE ConversationID = @ID)

    
    -- Cascade delete from ConversationDetail
    DELETE FROM 
        [__mj].[ConversationDetail] 
    WHERE 
        [ConversationID] = @ID
    
    DELETE FROM 
        [__mj].[Conversation]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the ID to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateVectorIndex]'
GO


CREATE PROCEDURE [__mj].[spUpdateVectorIndex]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID int,
    @EmbeddingModelID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorIndex]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [VectorDatabaseID] = @VectorDatabaseID,
        [EmbeddingModelID] = @EmbeddingModelID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwVectorIndexes] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateErrorLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateErrorLog]
    @ID int,
    @CompanyIntegrationRunID int,
    @CompanyIntegrationRunDetailID int,
    @Code nchar(20),
    @Message nvarchar(MAX),
    @CreatedBy nvarchar(50),
    @Status nvarchar(10),
    @Category nvarchar(20),
    @Details nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ErrorLog]
    SET 
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [CompanyIntegrationRunDetailID] = @CompanyIntegrationRunDetailID,
        [Code] = @Code,
        [Message] = @Message,
        [CreatedBy] = @CreatedBy,
        [Status] = @Status,
        [Category] = @Category,
        [Details] = @Details
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwErrorLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRun]'
GO

CREATE PROC [__mj].[spCreateCompanyIntegrationRun]
@CompanyIntegrationID AS INT,
@RunByUserID AS INT,
@StartedAt AS DATETIMEOFFSET(7) = NULL, 
@Comments AS NVARCHAR(MAX) = NULL,
@TotalRecords INT = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO __mj.CompanyIntegrationRun
(  
  CompanyIntegrationID,
  RunByUserID,
  StartedAt,
  TotalRecords,
  Comments
)
VALUES
(
  @CompanyIntegrationID,
  @RunByUserID,
  IIF(@StartedAt IS NULL, GETDATE(), @StartedAt),
  IIF(@TotalRecords IS NULL, 0, @TotalRecords),
  @Comments 
)

SELECT @NewID = SCOPE_IDENTITY()
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQuery]'
GO


CREATE PROCEDURE [__mj].[spUpdateQuery]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @SQL nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Query]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [SQL] = @SQL,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwQueries] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserView]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserView]
    @ID int,
    @UserID int,
    @EntityID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID int,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserView]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [IsShared] = @IsShared,
        [IsDefault] = @IsDefault,
        [GridState] = @GridState,
        [FilterState] = @FilterState,
        [CustomFilterState] = @CustomFilterState,
        [SmartFilterEnabled] = @SmartFilterEnabled,
        [SmartFilterPrompt] = @SmartFilterPrompt,
        [SmartFilterWhereClause] = @SmartFilterWhereClause,
        [SmartFilterExplanation] = @SmartFilterExplanation,
        [WhereClause] = @WhereClause,
        [CustomWhereClause] = @CustomWhereClause,
        [SortState] = @SortState,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserViews] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRunAPILog]'
GO

CREATE PROC [__mj].[spCreateCompanyIntegrationRunAPILog]
(@CompanyIntegrationRunID INT, @RequestMethod NVARCHAR(12), @URL NVARCHAR(MAX), @Parameters NVARCHAR(MAX)=NULL, @IsSuccess BIT)
AS
INSERT INTO [__mj].[CompanyIntegrationRunAPILog]
           ([CompanyIntegrationRunID]
           ,[RequestMethod]
		   ,[URL]
		   ,[Parameters]
           ,[IsSuccess])
     VALUES
           (@CompanyIntegrationRunID
           ,@RequestMethod
		   ,@URL
		   ,@Parameters
           ,@IsSuccess)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocumentType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocumentType]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentTypes] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRun]
    @ID int,
    @CompanyIntegrationID int,
    @RunByUserID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @TotalRecords int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRun]
    SET 
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [RunByUserID] = @RunByUserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [TotalRecords] = @TotalRecords,
        [Comments] = @Comments
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrationRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRunDetail]'
GO

CREATE PROC [__mj].[spCreateCompanyIntegrationRunDetail]
@CompanyIntegrationRunID AS INT,
@EntityID INT=NULL,
@EntityName NVARCHAR(200)=NULL,
@RecordID INT,
@Action NCHAR(20),
@IsSuccess BIT,
@ExecutedAt DATETIMEOFFSET(7) = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO __mj.CompanyIntegrationRunDetail
(  
  CompanyIntegrationRunID,
  EntityID,
  RecordID,
  Action,
  IsSuccess,
  ExecutedAt
)
VALUES
(
  @CompanyIntegrationRunID,
  IIF (@EntityID IS NULL, (SELECT ID FROM __mj.Entity WHERE REPLACE(Name,' ', '')=@EntityName), @EntityID),
  @RecordID,
  @Action,
  @IsSuccess,
  IIF (@ExecutedAt IS NULL, GETDATE(), @ExecutedAt)
)

SELECT @NewID = SCOPE_IDENTITY()
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteQueryCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteQueryCategory]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[QueryCategory]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserView]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserView]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserView]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateErrorLog]'
GO

CREATE PROC [__mj].[spCreateErrorLog]
(
@CompanyIntegrationRunID AS INT = NULL,
@CompanyIntegrationRunDetailID AS INT = NULL,
@Code AS NCHAR(20) = NULL,
@Status AS NVARCHAR(10) = NULL,
@Category AS NVARCHAR(20) = NULL,
@Message AS NVARCHAR(MAX) = NULL,
@Details AS NVARCHAR(MAX) = NULL,
@ErrorLogID AS INT OUTPUT
)
AS


INSERT INTO [__mj].[ErrorLog]
           ([CompanyIntegrationRunID]
           ,[CompanyIntegrationRunDetailID]
           ,[Code]
		   ,[Status]
		   ,[Category]
           ,[Message]
		   ,[Details])
     VALUES
           (@CompanyIntegrationRunID,
           @CompanyIntegrationRunDetailID,
           @Code,
		   @Status,
		   @Category,
           @Message,
		   @Details)

	--Get the ID of the new ErrorLog record
	SELECT @ErrorLogID = SCOPE_IDENTITY()
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityDocumentRuns]'
GO


CREATE VIEW [__mj].[vwEntityDocumentRuns]
AS
SELECT 
    e.*,
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument]
FROM
    [__mj].[EntityDocumentRun] AS e
INNER JOIN
    [__mj].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap]'
GO

CREATE PROC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
(
	@EntityFieldID INT, 
	@RelatedEntityNameFieldMap NVARCHAR(50)
)
AS
UPDATE 
	__mj.EntityField 
SET 
	RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap
WHERE
	ID = @EntityFieldID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwVectorDatabases]'
GO


CREATE VIEW [__mj].[vwVectorDatabases]
AS
SELECT 
    v.*
FROM
    [__mj].[VectorDatabase] AS v
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwApplications]'
GO


CREATE VIEW [__mj].[vwApplications]
AS
SELECT 
    a.*
FROM
    [__mj].[Application] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrationRunsRanked]'
GO

CREATE VIEW [__mj].[vwCompanyIntegrationRunsRanked] AS
SELECT
	ci.ID,
	ci.CompanyIntegrationID,
	ci.StartedAt,
	ci.EndedAt,
	ci.TotalRecords,
	ci.RunByUserID,
	ci.Comments,
	RANK() OVER(PARTITION BY ci.CompanyIntegrationID ORDER BY ci.ID DESC) [RunOrder]
 FROM
	__mj.CompanyIntegrationRun ci
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityRecordDocuments]'
GO


CREATE VIEW [__mj].[vwEntityRecordDocuments]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityRecordDocument] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityPermission]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityPermission]
    @EntityID int,
    @RoleName nvarchar(50),
    @CanCreate bit,
    @CanRead bit,
    @CanUpdate bit,
    @CanDelete bit,
    @ReadRLSFilterID int,
    @CreateRLSFilterID int,
    @UpdateRLSFilterID int,
    @DeleteRLSFilterID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityPermission]
        (
            [EntityID],
            [RoleName],
            [CanCreate],
            [CanRead],
            [CanUpdate],
            [CanDelete],
            [ReadRLSFilterID],
            [CreateRLSFilterID],
            [UpdateRLSFilterID],
            [DeleteRLSFilterID]
        )
    VALUES
        (
            @EntityID,
            @RoleName,
            @CanCreate,
            @CanRead,
            @CanUpdate,
            @CanDelete,
            @ReadRLSFilterID,
            @CreateRLSFilterID,
            @UpdateRLSFilterID,
            @DeleteRLSFilterID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityPermissions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spGetAuthenticationDataByExternalSystemID]'
GO

CREATE PROC [__mj].[spGetAuthenticationDataByExternalSystemID] 
	@IntegrationName NVARCHAR(100), 
	@ExternalSystemID NVARCHAR(100),
	@AccessToken NVARCHAR(255)=NULL OUTPUT,
	@RefreshToken NVARCHAR(255)=NULL OUTPUT,
	@TokenExpirationDate DATETIME=NULL OUTPUT,
	@APIKey NVARCHAR(255)=NULL OUTPUT
AS

SET @IntegrationName = TRIM(@IntegrationName)
SET @ExternalSystemID = TRIM(@ExternalSystemID)

SELECT
	@AccessToken = ci.AccessToken,
	@RefreshToken = ci.RefreshToken,
	@TokenExpirationDate = ci.TokenExpirationDate,
	@APIKey = ci.APIKey
FROM
	__mj.CompanyIntegration ci
JOIN __mj.Integration i
	ON i.Name = ci.IntegrationName
WHERE 
	i.Name = @IntegrationName
	AND ci.ExternalSystemID = @ExternalSystemID
	AND ci.IsActive = 1
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityDocuments]'
GO


CREATE VIEW [__mj].[vwEntityDocuments]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    EntityDocumentType_TypeID.[Name] AS [Type]
FROM
    [__mj].[EntityDocument] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[EntityDocumentType] AS EntityDocumentType_TypeID
  ON
    [e].[TypeID] = EntityDocumentType_TypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spCreateUserApplicationEntity]
    @UserApplicationID int,
    @EntityID int,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserApplicationEntity]
        (
            [UserApplicationID],
            [EntityID],
            [Sequence]
        )
    VALUES
        (
            @UserApplicationID,
            @EntityID,
            @Sequence
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserApplicationEntities] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityFieldsWithCheckConstraints]'
GO

CREATE VIEW [__mj].[vwEntityFieldsWithCheckConstraints]
AS
SELECT 
	e.ID as EntityID,
	e.Name as EntityName,
    sch.name AS SchemaName,
    obj.name AS TableName,
    col.name AS ColumnName,
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition
FROM 
    sys.check_constraints cc
INNER JOIN 
    sys.objects obj ON cc.parent_object_id = obj.object_id
INNER JOIN 
    sys.schemas sch ON obj.schema_id = sch.schema_id
INNER JOIN 
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
INNER JOIN
	__mj.Entity e
	ON
	e.SchemaName = sch.Name AND
	e.BaseTable = obj.name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDataContextItems]'
GO


CREATE VIEW [__mj].[vwDataContextItems]
AS
SELECT 
    d.*,
    DataContext_DataContextID.[Name] AS [DataContext],
    UserView_ViewID.[Name] AS [View],
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[DataContextItem] AS d
INNER JOIN
    [__mj].[DataContext] AS DataContext_DataContextID
  ON
    [d].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [__mj].[UserView] AS UserView_ViewID
  ON
    [d].[ViewID] = UserView_ViewID.[ID]
LEFT OUTER JOIN
    [__mj].[Query] AS Query_QueryID
  ON
    [d].[QueryID] = Query_QueryID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spCreateApplicationEntity]
    @ApplicationName nvarchar(50),
    @EntityID int,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ApplicationEntity]
        (
            [ApplicationName],
            [EntityID],
            [Sequence],
            [DefaultForNewUser]
        )
    VALUES
        (
            @ApplicationName,
            @EntityID,
            @Sequence,
            @DefaultForNewUser
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplicationEntities] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateVectorDatabase]'
GO


CREATE PROCEDURE [__mj].[spCreateVectorDatabase]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DefaultURL nvarchar(255),
    @ClassKey nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[VectorDatabase]
        (
            [Name],
            [Description],
            [DefaultURL],
            [ClassKey]
        )
    VALUES
        (
            @Name,
            @Description,
            @DefaultURL,
            @ClassKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwVectorDatabases] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserApplication]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserApplication]
    @ID int,
    @UserID int,
    @ApplicationID int,
    @Sequence int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserApplication]
    SET 
        [UserID] = @UserID,
        [ApplicationID] = @ApplicationID,
        [Sequence] = @Sequence,
        [IsActive] = @IsActive
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserApplications] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityDocumentRun]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocumentRun]
    @EntityDocumentID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityDocumentRun]
        (
            [EntityDocumentID],
            [StartedAt],
            [EndedAt],
            [Status]
        )
    VALUES
        (
            @EntityDocumentID,
            @StartedAt,
            @EndedAt,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentRuns] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateApplication]'
GO


CREATE PROCEDURE [__mj].[spCreateApplication]
    @Name nvarchar(50),
    @Description nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Application]
        (
            [Name],
            [Description]
        )
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplications] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityDocument]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocument]
    @Name nvarchar(250),
    @EntityID int,
    @TypeID int,
    @Status nvarchar(15),
    @Template nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityDocument]
        (
            [Name],
            [EntityID],
            [TypeID],
            [Status],
            [Template]
        )
    VALUES
        (
            @Name,
            @EntityID,
            @TypeID,
            @Status,
            @Template
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityPermission]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityPermission]
    @ID int,
    @EntityID int,
    @RoleName nvarchar(50),
    @CanCreate bit,
    @CanRead bit,
    @CanUpdate bit,
    @CanDelete bit,
    @ReadRLSFilterID int,
    @CreateRLSFilterID int,
    @UpdateRLSFilterID int,
    @DeleteRLSFilterID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityPermission]
    SET 
        [EntityID] = @EntityID,
        [RoleName] = @RoleName,
        [CanCreate] = @CanCreate,
        [CanRead] = @CanRead,
        [CanUpdate] = @CanUpdate,
        [CanDelete] = @CanDelete,
        [ReadRLSFilterID] = @ReadRLSFilterID,
        [CreateRLSFilterID] = @CreateRLSFilterID,
        [UpdateRLSFilterID] = @UpdateRLSFilterID,
        [DeleteRLSFilterID] = @DeleteRLSFilterID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityPermissions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityRecordDocument]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityRecordDocument]
    @EntityID int,
    @RecordID nvarchar(255),
    @DocumentText nvarchar(MAX),
    @VectorIndexID int,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityRecordDocument]
        (
            [EntityID],
            [RecordID],
            [DocumentText],
            [VectorIndexID],
            [VectorID],
            [VectorJSON],
            [EntityRecordUpdatedAt]
        )
    VALUES
        (
            @EntityID,
            @RecordID,
            @DocumentText,
            @VectorIndexID,
            @VectorID,
            @VectorJSON,
            @EntityRecordUpdatedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRecordDocuments] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserApplicationEntity]
    @ID int,
    @UserApplicationID int,
    @EntityID int,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserApplicationEntity]
    SET 
        [UserApplicationID] = @UserApplicationID,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserApplicationEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDataContextItem]'
GO


CREATE PROCEDURE [__mj].[spCreateDataContextItem]
    @DataContextID int,
    @Type nvarchar(50),
    @ViewID int,
    @QueryID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[DataContextItem]
        (
            [DataContextID],
            [Type],
            [ViewID],
            [QueryID],
            [EntityID],
            [RecordID],
            [SQL],
            [DataJSON],
            [LastRefreshedAt]
        )
    VALUES
        (
            @DataContextID,
            @Type,
            @ViewID,
            @QueryID,
            @EntityID,
            @RecordID,
            @SQL,
            @DataJSON,
            @LastRefreshedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDataContextItems] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spUpdateApplicationEntity]
    @ID int,
    @ApplicationName nvarchar(50),
    @EntityID int,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationEntity]
    SET 
        [ApplicationName] = @ApplicationName,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [DefaultForNewUser] = @DefaultForNewUser,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwApplicationEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateVectorDatabase]'
GO


CREATE PROCEDURE [__mj].[spUpdateVectorDatabase]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DefaultURL nvarchar(255),
    @ClassKey nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorDatabase]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DefaultURL] = @DefaultURL,
        [ClassKey] = @ClassKey,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwVectorDatabases] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserApplication]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserApplication]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserApplication]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocumentRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocumentRun]
    @ID int,
    @EntityDocumentID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentRun]
    SET 
        [EntityDocumentID] = @EntityDocumentID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateApplication]'
GO


CREATE PROCEDURE [__mj].[spUpdateApplication]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwApplications] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocument]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocument]
    @ID int,
    @Name nvarchar(250),
    @EntityID int,
    @TypeID int,
    @Status nvarchar(15),
    @Template nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocument]
    SET 
        [Name] = @Name,
        [EntityID] = @EntityID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [Template] = @Template,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityPermission]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityPermission]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityPermission]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityRecordDocument]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityRecordDocument]
    @ID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @DocumentText nvarchar(MAX),
    @VectorIndexID int,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRecordDocument]
    SET 
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [DocumentText] = @DocumentText,
        [VectorIndexID] = @VectorIndexID,
        [VectorID] = @VectorID,
        [VectorJSON] = @VectorJSON,
        [EntityRecordUpdatedAt] = @EntityRecordUpdatedAt,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityRecordDocuments] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserApplicationEntity]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserApplicationEntity]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDataContextItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateDataContextItem]
    @ID int,
    @DataContextID int,
    @Type nvarchar(50),
    @ViewID int,
    @QueryID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContextItem]
    SET 
        [DataContextID] = @DataContextID,
        [Type] = @Type,
        [ViewID] = @ViewID,
        [QueryID] = @QueryID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [SQL] = @SQL,
        [DataJSON] = @DataJSON,
        [LastRefreshedAt] = @LastRefreshedAt,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDataContextItems] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spDeleteApplicationEntity]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ApplicationEntity]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDataContexts]'
GO


CREATE VIEW [__mj].[vwDataContexts]
AS
SELECT 
    d.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[DataContext] AS d
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteApplication]'
GO


CREATE PROCEDURE [__mj].[spDeleteApplication]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Application]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDashboardCategories]'
GO


CREATE VIEW [__mj].[vwDashboardCategories]
AS
SELECT 
    d.*,
    DashboardCategory_ParentID.[Name] AS [Parent]
FROM
    [__mj].[DashboardCategory] AS d
LEFT OUTER JOIN
    [__mj].[DashboardCategory] AS DashboardCategory_ParentID
  ON
    [d].[ParentID] = DashboardCategory_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwLists]'
GO


CREATE VIEW [__mj].[vwLists]
AS
SELECT 
    l.*,
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[List] AS l
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [l].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [l].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserViewCategories]'
GO


CREATE VIEW [__mj].[vwUserViewCategories]
AS
SELECT 
    u.*,
    UserViewCategory_ParentID.[Name] AS [Parent]
FROM
    [__mj].[UserViewCategory] AS u
LEFT OUTER JOIN
    [__mj].[UserViewCategory] AS UserViewCategory_ParentID
  ON
    [u].[ParentID] = UserViewCategory_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwListDetails]'
GO


CREATE VIEW [__mj].[vwListDetails]
AS
SELECT 
    l.*
FROM
    [__mj].[ListDetail] AS l
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwReportCategories]'
GO


CREATE VIEW [__mj].[vwReportCategories]
AS
SELECT 
    r.*,
    ReportCategory_ParentID.[Name] AS [Parent]
FROM
    [__mj].[ReportCategory] AS r
LEFT OUTER JOIN
    [__mj].[ReportCategory] AS ReportCategory_ParentID
  ON
    [r].[ParentID] = ReportCategory_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserViewRuns]'
GO


CREATE VIEW [__mj].[vwUserViewRuns]
AS
SELECT 
    u.*,
    UserView_UserViewID.[Name] AS [UserView],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [__mj].[UserViewRun] AS u
INNER JOIN
    [__mj].[UserView] AS UserView_UserViewID
  ON
    [u].[UserViewID] = UserView_UserViewID.[ID]
INNER JOIN
    [__mj].[User] AS User_RunByUserID
  ON
    [u].[RunByUserID] = User_RunByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwFileStorageProviders]'
GO


CREATE VIEW [__mj].[vwFileStorageProviders]
AS
SELECT 
    f.*
FROM
    [__mj].[FileStorageProvider] AS f
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrationRunAPILogs]'
GO


CREATE VIEW [__mj].[vwCompanyIntegrationRunAPILogs]
AS
SELECT 
    c.*
FROM
    [__mj].[CompanyIntegrationRunAPILog] AS c
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDataContext]'
GO


CREATE PROCEDURE [__mj].[spCreateDataContext]
    @Name nvarchar(255),
    @UserID int,
    @Description nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[DataContext]
        (
            [Name],
            [UserID],
            [Description],
            [LastRefreshedAt]
        )
    VALUES
        (
            @Name,
            @UserID,
            @Description,
            @LastRefreshedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDataContexts] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewRunDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewRunDetail]
    @UserViewRunID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserViewRunDetail]
        (
            [UserViewRunID],
            [RecordID]
        )
    VALUES
        (
            @UserViewRunID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViewRunDetails] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDashboardCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateDashboardCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[DashboardCategory]
        (
            [Name],
            [Description],
            [ParentID]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDashboardCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateList]'
GO


CREATE PROCEDURE [__mj].[spCreateList]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID int,
    @UserID int,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[List]
        (
            [Name],
            [Description],
            [EntityID],
            [UserID],
            [ExternalSystemRecordID],
            [CompanyIntegrationID]
        )
    VALUES
        (
            @Name,
            @Description,
            @EntityID,
            @UserID,
            @ExternalSystemRecordID,
            @CompanyIntegrationID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLists] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @EntityID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserViewCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [EntityID]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @EntityID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViewCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateListDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateListDetail]
    @ListID int,
    @RecordID nvarchar(255),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ListDetail]
        (
            [ListID],
            [RecordID],
            [Sequence]
        )
    VALUES
        (
            @ListID,
            @RecordID,
            @Sequence
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwListDetails] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateReportCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateReportCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ReportCategory]
        (
            [Name],
            [Description],
            [ParentID]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwReportCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewRun]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewRun]
    @UserViewID int,
    @RunAt datetime,
    @RunByUserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserViewRun]
        (
            [UserViewID],
            [RunAt],
            [RunByUserID]
        )
    VALUES
        (
            @UserViewID,
            @RunAt,
            @RunByUserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViewRuns] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFileStorageProvider]'
GO


CREATE PROCEDURE [__mj].[spCreateFileStorageProvider]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[FileStorageProvider]
        (
            [Name],
            [Description],
            [ServerDriverKey],
            [ClientDriverKey],
            [Priority],
            [IsActive]
        )
    VALUES
        (
            @Name,
            @Description,
            @ServerDriverKey,
            @ClientDriverKey,
            @Priority,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFileStorageProviders] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRunAPILog]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRunAPILog]
    @ID int,
    @CompanyIntegrationRunID int,
    @ExecutedAt datetime,
    @IsSuccess bit,
    @RequestMethod nvarchar(12),
    @URL nvarchar(MAX),
    @Parameters nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRunAPILog]
    SET 
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [ExecutedAt] = @ExecutedAt,
        [IsSuccess] = @IsSuccess,
        [RequestMethod] = @RequestMethod,
        [URL] = @URL,
        [Parameters] = @Parameters
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrationRunAPILogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDataContext]'
GO


CREATE PROCEDURE [__mj].[spUpdateDataContext]
    @ID int,
    @Name nvarchar(255),
    @UserID int,
    @Description nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContext]
    SET 
        [Name] = @Name,
        [UserID] = @UserID,
        [Description] = @Description,
        [LastRefreshedAt] = @LastRefreshedAt,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDataContexts] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserViewRunDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserViewRunDetail]
    @ID int,
    @UserViewRunID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewRunDetail]
    SET 
        [UserViewRunID] = @UserViewRunID,
        [RecordID] = @RecordID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserViewRunDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDashboardCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateDashboardCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DashboardCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDashboardCategories] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateList]'
GO


CREATE PROCEDURE [__mj].[spUpdateList]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID int,
    @UserID int,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[List]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [EntityID] = @EntityID,
        [UserID] = @UserID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwLists] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserViewCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserViewCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @EntityID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UpdatedAt] = GETDATE(),
        [EntityID] = @EntityID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserViewCategories] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateListDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateListDetail]
    @ID int,
    @ListID int,
    @RecordID nvarchar(255),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListDetail]
    SET 
        [ListID] = @ListID,
        [RecordID] = @RecordID,
        [Sequence] = @Sequence
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwListDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateReportCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateReportCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwReportCategories] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserViewRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserViewRun]
    @ID int,
    @UserViewID int,
    @RunAt datetime,
    @RunByUserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewRun]
    SET 
        [UserViewID] = @UserViewID,
        [RunAt] = @RunAt,
        [RunByUserID] = @RunByUserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwUserViewRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFileStorageProvider]'
GO


CREATE PROCEDURE [__mj].[spUpdateFileStorageProvider]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileStorageProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ServerDriverKey] = @ServerDriverKey,
        [ClientDriverKey] = @ClientDriverKey,
        [Priority] = @Priority,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwFileStorageProviders] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteList]'
GO


CREATE PROCEDURE [__mj].[spDeleteList]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[List]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDashboardCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteDashboardCategory]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[DashboardCategory]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteListDetail]'
GO


CREATE PROCEDURE [__mj].[spDeleteListDetail]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ListDetail]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserViewCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserViewCategory]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserViewCategory]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteReportCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteReportCategory]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ReportCategory]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwWorkflowEngines]'
GO


CREATE VIEW [__mj].[vwWorkflowEngines]
AS
SELECT 
    w.*
FROM
    [__mj].[WorkflowEngine] AS w
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwFiles]'
GO


CREATE VIEW [__mj].[vwFiles]
AS
SELECT 
    f.*,
    FileStorageProvider_ProviderID.[Name] AS [Provider],
    FileCategory_CategoryID.[Name] AS [Category]
FROM
    [__mj].[File] AS f
INNER JOIN
    [__mj].[FileStorageProvider] AS FileStorageProvider_ProviderID
  ON
    [f].[ProviderID] = FileStorageProvider_ProviderID.[ID]
LEFT OUTER JOIN
    [__mj].[FileCategory] AS FileCategory_CategoryID
  ON
    [f].[CategoryID] = FileCategory_CategoryID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserRoles]'
GO


CREATE VIEW [__mj].[vwUserRoles]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[UserRole] AS u
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwFileEntityRecordLinks]'
GO


CREATE VIEW [__mj].[vwFileEntityRecordLinks]
AS
SELECT 
    f.*,
    File_FileID.[Name] AS [File],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[FileEntityRecordLink] AS f
INNER JOIN
    [__mj].[File] AS File_FileID
  ON
    [f].[FileID] = File_FileID.[ID]
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [f].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkflowRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkflowRun]
    @ID int,
    @WorkflowName nvarchar(100),
    @ExternalSystemRecordID nvarchar(100),
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nchar(10),
    @Results nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowRun]
    SET 
        [WorkflowName] = @WorkflowName,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [Results] = @Results
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwWorkflowRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwFileCategories]'
GO


CREATE VIEW [__mj].[vwFileCategories]
AS
SELECT 
    f.*,
    FileCategory_ParentID.[Name] AS [Parent]
FROM
    [__mj].[FileCategory] AS f
LEFT OUTER JOIN
    [__mj].[FileCategory] AS FileCategory_ParentID
  ON
    [f].[ParentID] = FileCategory_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkflow]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkflow]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @WorkflowEngineName nvarchar(100),
    @CompanyName nvarchar(50),
    @ExternalSystemRecordID nvarchar(100),
    @AutoRunEnabled bit,
    @AutoRunIntervalUnits nvarchar(20),
    @AutoRunInterval int,
    @SubclassName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workflow]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [WorkflowEngineName] = @WorkflowEngineName,
        [CompanyName] = @CompanyName,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [UpdatedAt] = GETDATE(),
        [AutoRunEnabled] = @AutoRunEnabled,
        [AutoRunIntervalUnits] = @AutoRunIntervalUnits,
        [AutoRunInterval] = @AutoRunInterval,
        [SubclassName] = @SubclassName
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwWorkflows] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkflowEngine]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkflowEngine]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverPath nvarchar(500),
    @DriverClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowEngine]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DriverPath] = @DriverPath,
        [DriverClass] = @DriverClass,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwWorkflowEngines] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateVersionInstallation]'
GO


CREATE PROCEDURE [__mj].[spCreateVersionInstallation]
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetime,
    @Status nvarchar(20),
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[VersionInstallation]
        (
            [MajorVersion],
            [MinorVersion],
            [PatchVersion],
            [Type],
            [InstalledAt],
            [Status],
            [InstallLog],
            [Comments]
        )
    VALUES
        (
            @MajorVersion,
            @MinorVersion,
            @PatchVersion,
            @Type,
            @InstalledAt,
            @Status,
            @InstallLog,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwVersionInstallations] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserRole]'
GO


CREATE PROCEDURE [__mj].[spCreateUserRole]
    @UserID int,
    @RoleName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserRole]
        (
            [UserID],
            [RoleName]
        )
    VALUES
        (
            @UserID,
            @RoleName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserRoles] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFile]'
GO


CREATE PROCEDURE [__mj].[spCreateFile]
    @Name nvarchar(500),
    @Description nvarchar(MAX),
    @ProviderID int,
    @ContentType nvarchar(50),
    @ProviderKey nvarchar(500),
    @CategoryID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[File]
        (
            [Name],
            [Description],
            [ProviderID],
            [ContentType],
            [ProviderKey],
            [CategoryID],
            [Status]
        )
    VALUES
        (
            @Name,
            @Description,
            @ProviderID,
            @ContentType,
            @ProviderKey,
            @CategoryID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFiles] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserRole]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserRole]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[UserRole]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFileEntityRecordLink]'
GO


CREATE PROCEDURE [__mj].[spCreateFileEntityRecordLink]
    @FileID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[FileEntityRecordLink]
        (
            [FileID],
            [EntityID],
            [RecordID]
        )
    VALUES
        (
            @FileID,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFileEntityRecordLinks] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRowLevelSecurityFilters]'
GO


CREATE VIEW [__mj].[vwRowLevelSecurityFilters]
AS
SELECT 
    r.*
FROM
    [__mj].[RowLevelSecurityFilter] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFileCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateFileCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[FileCategory]
        (
            [Name],
            [Description],
            [ParentID]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFileCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAuditLogs]'
GO


CREATE VIEW [__mj].[vwAuditLogs]
AS
SELECT 
    a.*,
    User_UserID.[Name] AS [User],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[AuditLog] AS a
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [a].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAuditLogTypes]'
GO


CREATE VIEW [__mj].[vwAuditLogTypes]
AS
SELECT 
    a.*,
    AuditLogType_ParentID.[Name] AS [Parent]
FROM
    [__mj].[AuditLogType] AS a
LEFT OUTER JOIN
    [__mj].[AuditLogType] AS AuditLogType_ParentID
  ON
    [a].[ParentID] = AuditLogType_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateVersionInstallation]'
GO


CREATE PROCEDURE [__mj].[spUpdateVersionInstallation]
    @ID int,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetime,
    @Status nvarchar(20),
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VersionInstallation]
    SET 
        [MajorVersion] = @MajorVersion,
        [MinorVersion] = @MinorVersion,
        [PatchVersion] = @PatchVersion,
        [Type] = @Type,
        [InstalledAt] = @InstalledAt,
        [Status] = @Status,
        [InstallLog] = @InstallLog,
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwVersionInstallations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAuthorizationRoles]'
GO


CREATE VIEW [__mj].[vwAuthorizationRoles]
AS
SELECT 
    a.*
FROM
    [__mj].[AuthorizationRole] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFile]'
GO


CREATE PROCEDURE [__mj].[spUpdateFile]
    @ID int,
    @Name nvarchar(500),
    @Description nvarchar(MAX),
    @ProviderID int,
    @ContentType nvarchar(50),
    @ProviderKey nvarchar(500),
    @CategoryID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[File]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ProviderID] = @ProviderID,
        [ContentType] = @ContentType,
        [ProviderKey] = @ProviderKey,
        [CategoryID] = @CategoryID,
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwFiles] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAuthorizations]'
GO


CREATE VIEW [__mj].[vwAuthorizations]
AS
SELECT 
    a.*
FROM
    [__mj].[Authorization] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFileCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateFileCategory]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwFileCategories] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAuditLog]'
GO


CREATE PROCEDURE [__mj].[spCreateAuditLog]
    @AuditLogTypeName nvarchar(50),
    @UserID int,
    @AuthorizationName nvarchar(100),
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[AuditLog]
        (
            [AuditLogTypeName],
            [UserID],
            [AuthorizationName],
            [Status],
            [Description],
            [Details],
            [EntityID],
            [RecordID]
        )
    VALUES
        (
            @AuditLogTypeName,
            @UserID,
            @AuthorizationName,
            @Status,
            @Description,
            @Details,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAuditLogs] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFileEntityRecordLink]'
GO


CREATE PROCEDURE [__mj].[spUpdateFileEntityRecordLink]
    @ID int,
    @FileID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileEntityRecordLink]
    SET 
        [FileID] = @FileID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwFileEntityRecordLinks] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAuditLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateAuditLog]
    @ID int,
    @AuditLogTypeName nvarchar(50),
    @UserID int,
    @AuthorizationName nvarchar(100),
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AuditLog]
    SET 
        [AuditLogTypeName] = @AuditLogTypeName,
        [UserID] = @UserID,
        [AuthorizationName] = @AuthorizationName,
        [Status] = @Status,
        [Description] = @Description,
        [Details] = @Details,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwAuditLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAIModels]'
GO


CREATE VIEW [__mj].[vwAIModels]
AS
SELECT 
    a.*
FROM
    [__mj].[AIModel] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteFile]'
GO


CREATE PROCEDURE [__mj].[spDeleteFile]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[File]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityAIActions]'
GO


CREATE VIEW [__mj].[vwEntityAIActions]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    AIAction_AIActionID.[Name] AS [AIAction],
    AIModel_AIModelID.[Name] AS [AIModel],
    Entity_OutputEntityID.[Name] AS [OutputEntity]
FROM
    [__mj].[EntityAIAction] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[AIAction] AS AIAction_AIActionID
  ON
    [e].[AIActionID] = AIAction_AIActionID.[ID]
LEFT OUTER JOIN
    [__mj].[AIModel] AS AIModel_AIModelID
  ON
    [e].[AIModelID] = AIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_OutputEntityID
  ON
    [e].[OutputEntityID] = Entity_OutputEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteFileCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteFileCategory]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[FileCategory]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAIActions]'
GO


CREATE VIEW [__mj].[vwAIActions]
AS
SELECT 
    a.*,
    AIModel_DefaultModelID.[Name] AS [DefaultModel]
FROM
    [__mj].[AIAction] AS a
LEFT OUTER JOIN
    [__mj].[AIModel] AS AIModel_DefaultModelID
  ON
    [a].[DefaultModelID] = AIModel_DefaultModelID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAIModelActions]'
GO


CREATE VIEW [__mj].[vwAIModelActions]
AS
SELECT 
    a.*,
    AIModel_AIModelID.[Name] AS [AIModel],
    AIAction_AIActionID.[Name] AS [AIAction]
FROM
    [__mj].[AIModelAction] AS a
INNER JOIN
    [__mj].[AIModel] AS AIModel_AIModelID
  ON
    [a].[AIModelID] = AIModel_AIModelID.[ID]
INNER JOIN
    [__mj].[AIAction] AS AIAction_AIActionID
  ON
    [a].[AIActionID] = AIAction_AIActionID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIModel]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIModel]
    @ID int,
    @Name nvarchar(50),
    @Vendor nvarchar(50),
    @AIModelTypeID int,
    @Description nvarchar(MAX),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModel]
    SET 
        [Name] = @Name,
        [Vendor] = @Vendor,
        [AIModelTypeID] = @AIModelTypeID,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwAIModels] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityAIAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityAIAction]
    @ID int,
    @EntityID int,
    @AIActionID int,
    @AIModelID int,
    @Name nvarchar(25),
    @Prompt nvarchar(MAX),
    @TriggerEvent nchar(15),
    @UserMessage nvarchar(MAX),
    @OutputType nchar(10),
    @OutputField nvarchar(50),
    @SkipIfOutputFieldNotEmpty bit,
    @OutputEntityID int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAIAction]
    SET 
        [EntityID] = @EntityID,
        [AIActionID] = @AIActionID,
        [AIModelID] = @AIModelID,
        [Name] = @Name,
        [Prompt] = @Prompt,
        [TriggerEvent] = @TriggerEvent,
        [UserMessage] = @UserMessage,
        [OutputType] = @OutputType,
        [OutputField] = @OutputField,
        [SkipIfOutputFieldNotEmpty] = @SkipIfOutputFieldNotEmpty,
        [OutputEntityID] = @OutputEntityID,
        [Comments] = @Comments
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityAIActions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIAction]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultModelID int,
    @DefaultPrompt nvarchar(MAX),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIAction]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DefaultModelID] = @DefaultModelID,
        [DefaultPrompt] = @DefaultPrompt,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwAIActions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIModelAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIModelAction]
    @ID int,
    @AIModelID int,
    @AIActionID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelAction]
    SET 
        [AIModelID] = @AIModelID,
        [AIActionID] = @AIActionID,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwAIModelActions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueueTypes]'
GO


CREATE VIEW [__mj].[vwQueueTypes]
AS
SELECT 
    q.*
FROM
    [__mj].[QueueType] AS q
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ToProperCase]'
GO


CREATE FUNCTION [__mj].[ToProperCase](@string VARCHAR(255)) RETURNS VARCHAR(255)
AS
BEGIN
  DECLARE @i INT           -- index
  DECLARE @l INT           -- input length
  DECLARE @c NCHAR(1)      -- current char
  DECLARE @f INT           -- first letter flag (1/0)
  DECLARE @o VARCHAR(255)  -- output string
  DECLARE @w VARCHAR(10)   -- characters considered as white space

  SET @w = '[' + CHAR(13) + CHAR(10) + CHAR(9) + CHAR(160) + ' ' + ']'
  SET @i = 1
  SET @l = LEN(@string)
  SET @f = 1
  SET @o = ''

  WHILE @i <= @l
  BEGIN
    SET @c = SUBSTRING(@string, @i, 1)
    IF @f = 1 
    BEGIN
     SET @o = @o + @c
     SET @f = 0
    END
    ELSE
    BEGIN
     SET @o = @o + LOWER(@c)
    END

    IF @c LIKE @w SET @f = 1

    SET @i = @i + 1
  END

  RETURN @o
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ToTitleCase]'
GO

CREATE FUNCTION [__mj].[ToTitleCase] (@InputString varchar(4000))
RETURNS varchar(4000)
AS
BEGIN
    DECLARE @Index INT
    DECLARE @Char CHAR(1)
    DECLARE @OutputString varchar(255)
    SET @OutputString = LOWER(@InputString)
    SET @Index = 2
    SET @OutputString = STUFF(@OutputString, 1, 1, UPPER(SUBSTRING(@InputString,1,1)))

    WHILE @Index <= LEN(@InputString)
    BEGIN
        SET @Char = SUBSTRING(@InputString, @Index, 1)
        IF @Char IN (' ', ';', ':', '!', '?', ',', '.', '_', '-', '/', '&', '''', '(')
        BEGIN
            IF @Index + 1 <= LEN(@InputString)
            BEGIN
                SET @OutputString = STUFF(@OutputString, @Index + 1, 1, UPPER(SUBSTRING(@InputString, @Index + 1, 1)))
            END
        END
        SET @Index = @Index + 1
    END

    RETURN @OutputString

END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[fnInitials]'
GO


CREATE FUNCTION [__mj].[fnInitials] 
( @text VARCHAR(MAX))

RETURNS NVARCHAR(MAX)

AS
BEGIN

DECLARE  @Result NVARCHAR(MAX)
WHILE CHARINDEX('  ',@text)>0

 SET @text=TRIM(REPLACE(@text,'  ',' '))

 SELECT @Result = STRING_AGG(UPPER(LEFT(value,1)),N'. ')  + '.' FROM STRING_SPLIT (@text, N' ')
 RETURN @Result
 END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[parseDomainFromEmail]'
GO

CREATE FUNCTION [__mj].[parseDomainFromEmail](@Email NVARCHAR(320))
RETURNS NVARCHAR(255) AS
BEGIN
    DECLARE @Domain NVARCHAR(255)

    -- Check if @Email is not null or empty
    IF LTRIM(RTRIM(@Email)) = ''
        RETURN NULL

    -- Extract the domain part from the email
    SET @Domain = RIGHT(@Email, LEN(@Email) - CHARINDEX('@', @Email))

    RETURN @Domain
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[parseDomain]'
GO

CREATE FUNCTION [__mj].[parseDomain](
@url NVARCHAR(1000)
)
RETURNS NVARCHAR(255)

AS

BEGIN

declare @domain nvarchar(255)

-- Check if there is the "http://" in the @url
declare @http nvarchar(10)
declare @https nvarchar(10)
declare @protocol nvarchar(10)
set @http = 'http://'
set @https = 'https://'

declare @isHTTPS bit
set @isHTTPS = 0

select @domain = CharIndex(@http, @url)

IF CHARINDEX(@http, @url) > 1
BEGIN
IF CHARINDEX(@https, @url) = 1
SET @isHTTPS = 1
ELSE
SELECT @url = @http + @url
-- return 'Error at : ' + @url
-- select @url = substring(@url, CharIndex(@http, @url), len(@url) - CharIndex(@http, @url) + 1)
END

IF CHARINDEX(@http, @url) = 0
IF CHARINDEX(@https, @url) = 1
SET @isHTTPS = 1
ELSE
SELECT @url = @http + @url

IF @isHTTPS = 1
SET @protocol = @https
ELSE
SET @protocol = @http

IF CHARINDEX(@protocol, @url) = 1
BEGIN
SELECT @url = SUBSTRING(@url, LEN(@protocol) + 1, LEN(@url)-LEN(@protocol))
IF CHARINDEX('/', @url) > 0
SELECT @url = SUBSTRING(@url, 0, CHARINDEX('/', @url))

DECLARE @i INT
SET @i = 0
WHILE CHARINDEX('.', @url) > 0
BEGIN
SELECT @i = CHARINDEX('.', @url)
SELECT @url = STUFF(@url,@i,1,'/')
END
SELECT @url = STUFF(@url,@i,1,'.')

SET @i = 0
WHILE CHARINDEX('/', @url) > 0
BEGIN
SELECT @i = CHARINDEX('/', @url)
SELECT @url = STUFF(@url,@i,1,'.')
END

SELECT @domain = SUBSTRING(@url, @i + 1, LEN(@url)-@i)
END

RETURN @domain

END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spGetPrimaryKeyForTable]'
GO

CREATE PROC [__mj].[spGetPrimaryKeyForTable] 
  @TableName NVARCHAR(255),
  @SchemaName NVARCHAR(255)
AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable
FROM 
    sys.tables t
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN 
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN 
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
INNER JOIN 
    sys.types ty ON c.user_type_id = ty.user_type_id
WHERE 
    i.is_primary_key = 1
    AND t.name = @TableName
    AND s.name = @SchemaName;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [CK_AuditLog_Status] CHECK (([Status]='Success' OR [Status]='Failed'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [CK_AuthorizationRole_Type] CHECK (([Type]='Allow' OR [Type]='Deny'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CompanyIntegrationRunAPILog]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunAPILog] ADD CONSTRAINT [CK_CompanyIntegrationRunAPILog_RequestMethod] CHECK (([RequestMethod]='GET' OR [RequestMethod]='POST' OR [RequestMethod]='PUT' OR [RequestMethod]='DELETE' OR [RequestMethod]='PATCH' OR [RequestMethod]='HEAD' OR [RequestMethod]='OPTIONS'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ConversationDetail]'
GO
ALTER TABLE [__mj].[ConversationDetail] ADD CONSTRAINT [CK_ConversationDetail_Role] CHECK (([Role]='User' OR [Role]='AI' OR [Role]='Error'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[DataContextItem]'
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [CK_DataContextItem_Type] CHECK (([Type]='view' OR [Type]='sql' OR [Type]='query' OR [Type]='single_record' OR [Type]='full_entity'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityAIAction]'
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [CK_EntityAIAction_TriggerEvent] CHECK (([TriggerEvent]='after save' OR [TriggerEvent]='before save'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [CK_EntityAIAction_OutputType] CHECK (([OutputType]='entity' OR [OutputType]='field'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD CONSTRAINT [CK_EntityDocumentRun_Status] CHECK (([Status]='Pending' OR [Status]='Complete' OR [Status]='Failed'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [CK_EntityDocument_Status] CHECK (([Status]='Active' OR [Status]='Inactive'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_EntityField_ValueListType] CHECK (([ValueListType]='None' OR [ValueListType]='List' OR [ValueListType]='ListOrUserEntry'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_Type] CHECK (([Type]='One To Many' OR [Type]='Many To Many'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Query]'
GO
ALTER TABLE [__mj].[Query] ADD CONSTRAINT [CK_Query_Status] CHECK (([Status]='Pending' OR [Status]='Approved' OR [Status]='Rejected' OR [Status]='Expired'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[QueueTask]'
GO
ALTER TABLE [__mj].[QueueTask] ADD CONSTRAINT [CK_QueueTask_Status] CHECK (([Status]='In Progress' OR [Status]='Completed' OR [Status]='Failed'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CK_RecordChange_Status] CHECK (([Status]='Pending' OR [Status]='Complete'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordMergeDeletionLog]'
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] ADD CONSTRAINT [CK_RecordMergeDeletionLog_Status] CHECK (([Status]='Pending' OR [Status]='Complete' OR [Status]='Error'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordMergeLog]'
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [CK_RecordMergeLog_ApprovalStatus] CHECK (([ApprovalStatus]='Pending' OR [ApprovalStatus]='Approved' OR [ApprovalStatus]='Rejected'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [CK_RecordMergeLog_ProcessingStatus] CHECK (([ProcessingStatus]='Started' OR [ProcessingStatus]='Complete' OR [ProcessingStatus]='Error'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Report]'
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [CK_Report_SharingScope] CHECK (([SharingScope]='None' OR [SharingScope]='Specific' OR [SharingScope]='Everyone'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] ADD CONSTRAINT [CHK_EntityID_Positive] CHECK (([EntityIDMin]>(0) AND [EntityIDMax]>(0)))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[SchemaInfo] ADD CONSTRAINT [CHK_EntityID_Range] CHECK (([EntityIDMax]>[EntityIDMin]))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[User]'
GO
ALTER TABLE [__mj].[User] ADD CONSTRAINT [CK_User_Type] CHECK (([Type]='User' OR [Type]='Owner'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[VersionInstallation]'
GO
ALTER TABLE [__mj].[VersionInstallation] ADD CONSTRAINT [CK_VersionInstallation_Type] CHECK (([Type]='New' OR [Type]='Upgrade'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[VersionInstallation] ADD CONSTRAINT [CK_VersionInstallation_Status] CHECK (([Status]='Pending' OR [Status]='In Progress' OR [Status]='Complete' OR [Status]='Failed'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[WorkflowRun]'
GO
ALTER TABLE [__mj].[WorkflowRun] ADD CONSTRAINT [CK_WorkflowRun_Status] CHECK (([Status]='Pending' OR [Status]='In Progress' OR [Status]='Complete' OR [Status]='Failed'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [CK_AutoRunIntervalUnits] CHECK (([AutoRunIntervalUnits]='Minutes' OR [AutoRunIntervalUnits]='Hours' OR [AutoRunIntervalUnits]='Days' OR [AutoRunIntervalUnits]='Weeks' OR [AutoRunIntervalUnits]='Months' OR [AutoRunIntervalUnits]='Years'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AIAction]'
GO
ALTER TABLE [__mj].[AIAction] ADD CONSTRAINT [FK_AIAction_AIModel] FOREIGN KEY ([DefaultModelID]) REFERENCES [__mj].[AIModel] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AIModelAction]'
GO
ALTER TABLE [__mj].[AIModelAction] ADD CONSTRAINT [FK_AIModelAction_AIAction] FOREIGN KEY ([AIActionID]) REFERENCES [__mj].[AIAction] ([ID])
GO
ALTER TABLE [__mj].[AIModelAction] ADD CONSTRAINT [FK_AIModelAction_AIModel] FOREIGN KEY ([AIModelID]) REFERENCES [__mj].[AIModel] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AIModel]'
GO
ALTER TABLE [__mj].[AIModel] ADD CONSTRAINT [FK_AIModel_AIModelType] FOREIGN KEY ([AIModelTypeID]) REFERENCES [__mj].[AIModelType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [FK_ApplicationEntity_ApplicationName] FOREIGN KEY ([ApplicationName]) REFERENCES [__mj].[Application] ([Name])
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [FK_ApplicationEntity_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [FK_AuditLogType_Authorization] FOREIGN KEY ([AuthorizationName]) REFERENCES [__mj].[Authorization] ([Name])
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [FK_AuditLogType_ParentID] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[AuditLogType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_AuditLogType] FOREIGN KEY ([AuditLogTypeName]) REFERENCES [__mj].[AuditLogType] ([Name])
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_Authorization] FOREIGN KEY ([AuthorizationName]) REFERENCES [__mj].[Authorization] ([Name])
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [FK_AuthorizationRole_Authorization1] FOREIGN KEY ([AuthorizationName]) REFERENCES [__mj].[Authorization] ([Name])
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [FK_AuthorizationRole_Role1] FOREIGN KEY ([RoleName]) REFERENCES [__mj].[Role] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] ADD CONSTRAINT [FK_Authorization_Parent] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[Authorization] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] ADD CONSTRAINT [FK_CompanyIntegrationRecordMap_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [__mj].[CompanyIntegration] ([ID])
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] ADD CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CompanyIntegrationRunAPILog]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunAPILog] ADD CONSTRAINT [FK_CompanyIntegrationRunAPILog_CompanyIntegrationRun] FOREIGN KEY ([CompanyIntegrationRunID]) REFERENCES [__mj].[CompanyIntegrationRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CompanyIntegrationRunDetail]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] ADD CONSTRAINT [FK_CompanyIntegrationRunDetail_CompanyIntegrationRun] FOREIGN KEY ([CompanyIntegrationRunID]) REFERENCES [__mj].[CompanyIntegrationRun] ([ID])
GO
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] ADD CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CompanyIntegrationRun]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRun] ADD CONSTRAINT [FK_CompanyIntegrationRun_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [__mj].[CompanyIntegration] ([ID])
GO
ALTER TABLE [__mj].[CompanyIntegrationRun] ADD CONSTRAINT [FK_CompanyIntegrationRun_User] FOREIGN KEY ([RunByUserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CompanyIntegration]'
GO
ALTER TABLE [__mj].[CompanyIntegration] ADD CONSTRAINT [FK_CompanyIntegration_Company] FOREIGN KEY ([CompanyName]) REFERENCES [__mj].[Company] ([Name])
GO
ALTER TABLE [__mj].[CompanyIntegration] ADD CONSTRAINT [FK_CompanyIntegration_Integration] FOREIGN KEY ([IntegrationName]) REFERENCES [__mj].[Integration] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ConversationDetail]'
GO
ALTER TABLE [__mj].[ConversationDetail] ADD CONSTRAINT [FK__Conversat__Conve__051D25D5] FOREIGN KEY ([ConversationID]) REFERENCES [__mj].[Conversation] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Conversation]'
GO
ALTER TABLE [__mj].[Conversation] ADD CONSTRAINT [FK__Conversat__UserI__0429019C] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[Conversation] ADD CONSTRAINT [FK_Conversation_Entity] FOREIGN KEY ([LinkedEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DashboardCategory]'
GO
ALTER TABLE [__mj].[DashboardCategory] ADD CONSTRAINT [FK_DashboardCategory_DashboardCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[DashboardCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Dashboard]'
GO
ALTER TABLE [__mj].[Dashboard] ADD CONSTRAINT [FK__Dashboard__UserI__343EFBB6] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[Dashboard] ADD CONSTRAINT [FK_Dashboard_DashboardCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[DashboardCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DataContextItem]'
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [FK_DataContextItem_DataContext] FOREIGN KEY ([DataContextID]) REFERENCES [__mj].[DataContext] ([ID])
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [FK_DataContextItem_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [FK_DataContextItem_Query] FOREIGN KEY ([QueryID]) REFERENCES [__mj].[Query] ([ID])
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [FK_DataContextItem_UserView] FOREIGN KEY ([ViewID]) REFERENCES [__mj].[UserView] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DataContext]'
GO
ALTER TABLE [__mj].[DataContext] ADD CONSTRAINT [FK_DataContext_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DatasetItem]'
GO
ALTER TABLE [__mj].[DatasetItem] ADD CONSTRAINT [FK_DatasetItem_DatasetName] FOREIGN KEY ([DatasetName]) REFERENCES [__mj].[Dataset] ([Name])
GO
ALTER TABLE [__mj].[DatasetItem] ADD CONSTRAINT [FK_DatasetItem_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] ADD CONSTRAINT [FK_EmployeeCompanyIntegration_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [__mj].[CompanyIntegration] ([ID])
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] ADD CONSTRAINT [FK_EmployeeCompanyIntegration_Employee] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EmployeeRole]'
GO
ALTER TABLE [__mj].[EmployeeRole] ADD CONSTRAINT [FK__EmployeeR__Emplo__73852659] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID]) ON DELETE CASCADE
GO
ALTER TABLE [__mj].[EmployeeRole] ADD CONSTRAINT [FK__EmployeeR__RoleI__74794A92] FOREIGN KEY ([RoleID]) REFERENCES [__mj].[Role] ([ID]) ON DELETE CASCADE
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EmployeeSkill]'
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD CONSTRAINT [FK__EmployeeS__Emplo__756D6ECB] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID]) ON DELETE CASCADE
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD CONSTRAINT [FK_EmployeeSkill_Skill] FOREIGN KEY ([SkillID]) REFERENCES [__mj].[Skill] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [FK_Employee_Company] FOREIGN KEY ([CompanyID]) REFERENCES [__mj].[Company] ([ID])
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [FK_Employee_Supervisor] FOREIGN KEY ([SupervisorID]) REFERENCES [__mj].[Employee] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityAIAction]'
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_AIAction] FOREIGN KEY ([AIActionID]) REFERENCES [__mj].[AIAction] ([ID])
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_AIModel] FOREIGN KEY ([AIModelID]) REFERENCES [__mj].[AIModel] ([ID])
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_Entity1] FOREIGN KEY ([OutputEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD CONSTRAINT [FK_EntityDocumentRun_EntityDocument] FOREIGN KEY ([EntityDocumentID]) REFERENCES [__mj].[EntityDocument] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_EntityDocumentType] FOREIGN KEY ([TypeID]) REFERENCES [__mj].[EntityDocumentType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityFieldValue]'
GO
ALTER TABLE [__mj].[EntityFieldValue] ADD CONSTRAINT [FK_EntityFieldValue_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityFieldValue] ADD CONSTRAINT [FK_EntityFieldValue_EntityField] FOREIGN KEY ([EntityID], [EntityFieldName]) REFERENCES [__mj].[EntityField] ([EntityID], [Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [FK_EntityField_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [FK_EntityField_RelatedEntity] FOREIGN KEY ([RelatedEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityPermission]'
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_CreateRLSFilter] FOREIGN KEY ([CreateRLSFilterID]) REFERENCES [__mj].[RowLevelSecurityFilter] ([ID])
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_DeleteRLSFilter] FOREIGN KEY ([DeleteRLSFilterID]) REFERENCES [__mj].[RowLevelSecurityFilter] ([ID])
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_ReadRLSFilter] FOREIGN KEY ([ReadRLSFilterID]) REFERENCES [__mj].[RowLevelSecurityFilter] ([ID])
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_RoleName] FOREIGN KEY ([RoleName]) REFERENCES [__mj].[Role] ([Name])
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_UpdateRLSFilter] FOREIGN KEY ([UpdateRLSFilterID]) REFERENCES [__mj].[RowLevelSecurityFilter] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [FK_EntityRecordDocument_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_EntityID] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_RelatedEntityID] FOREIGN KEY ([RelatedEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_UserView1] FOREIGN KEY ([DisplayUserViewGUID]) REFERENCES [__mj].[UserView] ([GUID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [FK_Entity_Entity] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ErrorLog]'
GO
ALTER TABLE [__mj].[ErrorLog] ADD CONSTRAINT [FK_ErrorLog_CompanyIntegrationRunDetailID] FOREIGN KEY ([CompanyIntegrationRunDetailID]) REFERENCES [__mj].[CompanyIntegrationRunDetail] ([ID])
GO
ALTER TABLE [__mj].[ErrorLog] ADD CONSTRAINT [FK_ErrorLog_CompanyIntegrationRunID] FOREIGN KEY ([CompanyIntegrationRunID]) REFERENCES [__mj].[CompanyIntegrationRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[FileCategory]'
GO
ALTER TABLE [__mj].[FileCategory] ADD CONSTRAINT [FK_FileCategory_FileCategory_ParentID] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[FileCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[FileEntityRecordLink]'
GO
ALTER TABLE [__mj].[FileEntityRecordLink] ADD CONSTRAINT [FK_FileEntityRecordLink_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[FileEntityRecordLink] ADD CONSTRAINT [FK_FileEntityRecordLink_File] FOREIGN KEY ([FileID]) REFERENCES [__mj].[File] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[File]'
GO
ALTER TABLE [__mj].[File] ADD CONSTRAINT [FK_File_FileCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[FileCategory] ([ID])
GO
ALTER TABLE [__mj].[File] ADD CONSTRAINT [FK_File_FileStorageProvider] FOREIGN KEY ([ProviderID]) REFERENCES [__mj].[FileStorageProvider] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[IntegrationURLFormat]'
GO
ALTER TABLE [__mj].[IntegrationURLFormat] ADD CONSTRAINT [FK_IntegrationURLFormat_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[IntegrationURLFormat] ADD CONSTRAINT [FK_IntegrationURLFormat_Integration1] FOREIGN KEY ([IntegrationName]) REFERENCES [__mj].[Integration] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ListDetail]'
GO
ALTER TABLE [__mj].[ListDetail] ADD CONSTRAINT [FK_ListDetail_List] FOREIGN KEY ([ListID]) REFERENCES [__mj].[List] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[List]'
GO
ALTER TABLE [__mj].[List] ADD CONSTRAINT [FK_List_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [__mj].[CompanyIntegration] ([ID])
GO
ALTER TABLE [__mj].[List] ADD CONSTRAINT [FK_List_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[List] ADD CONSTRAINT [FK_List_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[QueryCategory]'
GO
ALTER TABLE [__mj].[QueryCategory] ADD CONSTRAINT [FK_QueryCategory_QueryCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[QueryCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[QueryField]'
GO
ALTER TABLE [__mj].[QueryField] ADD CONSTRAINT [FK_QueryField_Query] FOREIGN KEY ([QueryID]) REFERENCES [__mj].[Query] ([ID])
GO
ALTER TABLE [__mj].[QueryField] ADD CONSTRAINT [FK_QueryField_SourceEntity] FOREIGN KEY ([SourceEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[QueryPermission]'
GO
ALTER TABLE [__mj].[QueryPermission] ADD CONSTRAINT [FK_QueryPermission_Query] FOREIGN KEY ([QueryID]) REFERENCES [__mj].[Query] ([ID])
GO
ALTER TABLE [__mj].[QueryPermission] ADD CONSTRAINT [FK_QueryPermission_Role] FOREIGN KEY ([RoleName]) REFERENCES [__mj].[Role] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Query]'
GO
ALTER TABLE [__mj].[Query] ADD CONSTRAINT [FK_Query_QueryCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[QueryCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[QueueTask]'
GO
ALTER TABLE [__mj].[QueueTask] ADD CONSTRAINT [FK_QueueTask_Queue] FOREIGN KEY ([QueueID]) REFERENCES [__mj].[Queue] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Queue]'
GO
ALTER TABLE [__mj].[Queue] ADD CONSTRAINT [FK_Queue_QueueType] FOREIGN KEY ([QueueTypeID]) REFERENCES [__mj].[QueueType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordMergeDeletionLog]'
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] ADD CONSTRAINT [FK_RecordMergeDeletionLog_RecordMergeLog] FOREIGN KEY ([RecordMergeLogID]) REFERENCES [__mj].[RecordMergeLog] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordMergeLog]'
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [FK_RecordMergeLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [FK_RecordMergeLog_User] FOREIGN KEY ([InitiatedByUserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ReportCategory]'
GO
ALTER TABLE [__mj].[ReportCategory] ADD CONSTRAINT [FK_ReportCategory_ReportCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[ReportCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ReportSnapshot]'
GO
ALTER TABLE [__mj].[ReportSnapshot] ADD CONSTRAINT [FK__ReportSna__Repor__19241E82] FOREIGN KEY ([ReportID]) REFERENCES [__mj].[Report] ([ID])
GO
ALTER TABLE [__mj].[ReportSnapshot] ADD CONSTRAINT [FK__ReportSna__UserI__6BB324E4] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Report]'
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__Conversa__373E914E] FOREIGN KEY ([ConversationID]) REFERENCES [__mj].[Conversation] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__OutputDe__5E353582] FOREIGN KEY ([OutputDeliveryTypeID]) REFERENCES [__mj].[OutputDeliveryType] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__OutputEv__601D7DF4] FOREIGN KEY ([OutputEventID]) REFERENCES [__mj].[OutputDeliveryType] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__OutputFo__5D411149] FOREIGN KEY ([OutputFormatTypeID]) REFERENCES [__mj].[OutputFormatType] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__OutputTr__5C4CED10] FOREIGN KEY ([OutputTriggerTypeID]) REFERENCES [__mj].[OutputTriggerType] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__OutputWo__6111A22D] FOREIGN KEY ([OutputWorkflowID]) REFERENCES [__mj].[Workflow] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK__Report__UserID__5F2959BB] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK_Report_ConversationDetail] FOREIGN KEY ([ConversationDetailID]) REFERENCES [__mj].[ConversationDetail] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK_Report_DataContext] FOREIGN KEY ([DataContextID]) REFERENCES [__mj].[DataContext] ([ID])
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [FK_Report_ReportCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[ReportCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ResourceType]'
GO
ALTER TABLE [__mj].[ResourceType] ADD CONSTRAINT [FK__ResourceT__Entit__6D777912] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Skill]'
GO
ALTER TABLE [__mj].[Skill] ADD CONSTRAINT [FK_Skill_Skill] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[Skill] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[SystemEvent]'
GO
ALTER TABLE [__mj].[SystemEvent] ADD CONSTRAINT [FK_SystemEvent_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Tag]'
GO
ALTER TABLE [__mj].[Tag] ADD CONSTRAINT [FK__Tag__ParentID__592635D8] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[Tag] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[TaggedItem]'
GO
ALTER TABLE [__mj].[TaggedItem] ADD CONSTRAINT [FK__TaggedIte__TagID__77AABCF8] FOREIGN KEY ([TagID]) REFERENCES [__mj].[Tag] ([ID])
GO
ALTER TABLE [__mj].[TaggedItem] ADD CONSTRAINT [FK_TaggedItem_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserApplicationEntity]'
GO
ALTER TABLE [__mj].[UserApplicationEntity] ADD CONSTRAINT [FK_UserApplicationEntity_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[UserApplicationEntity] ADD CONSTRAINT [FK_UserApplicationEntity_UserApplication] FOREIGN KEY ([UserApplicationID]) REFERENCES [__mj].[UserApplication] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserApplication]'
GO
ALTER TABLE [__mj].[UserApplication] ADD CONSTRAINT [FK_UserApplication_Application] FOREIGN KEY ([ApplicationID]) REFERENCES [__mj].[Application] ([ID])
GO
ALTER TABLE [__mj].[UserApplication] ADD CONSTRAINT [FK_UserApplication_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserFavorite]'
GO
ALTER TABLE [__mj].[UserFavorite] ADD CONSTRAINT [FK_UserFavorite_ApplicationUser] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[UserFavorite] ADD CONSTRAINT [FK_UserFavorite_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserNotification]'
GO
ALTER TABLE [__mj].[UserNotification] ADD CONSTRAINT [FK_UserNotification_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserRecordLog]'
GO
ALTER TABLE [__mj].[UserRecordLog] ADD CONSTRAINT [FK_UserRecordLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[UserRecordLog] ADD CONSTRAINT [FK_UserRecordLog_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserRole]'
GO
ALTER TABLE [__mj].[UserRole] ADD CONSTRAINT [FK_UserRole_RoleName] FOREIGN KEY ([RoleName]) REFERENCES [__mj].[Role] ([Name])
GO
ALTER TABLE [__mj].[UserRole] ADD CONSTRAINT [FK_UserRole_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserViewCategory]'
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [FK_UserViewCategory_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [FK_UserViewCategory_UserViewCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[UserViewCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserViewRunDetail]'
GO
ALTER TABLE [__mj].[UserViewRunDetail] ADD CONSTRAINT [FK_UserViewRunDetail_UserViewRun] FOREIGN KEY ([UserViewRunID]) REFERENCES [__mj].[UserViewRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserViewRun]'
GO
ALTER TABLE [__mj].[UserViewRun] ADD CONSTRAINT [FK_UserViewRun_User] FOREIGN KEY ([RunByUserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[UserViewRun] ADD CONSTRAINT [FK_UserViewRun_UserView] FOREIGN KEY ([UserViewID]) REFERENCES [__mj].[UserView] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserView]'
GO
ALTER TABLE [__mj].[UserView] ADD CONSTRAINT [FK_UserView_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[UserView] ADD CONSTRAINT [FK_UserView_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[UserView] ADD CONSTRAINT [FK_UserView_UserViewCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[UserViewCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[User]'
GO
ALTER TABLE [__mj].[User] ADD CONSTRAINT [FK_User_LinkedEntity] FOREIGN KEY ([LinkedEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[VectorIndex]'
GO
ALTER TABLE [__mj].[VectorIndex] ADD CONSTRAINT [FK_VectorIndex_AIModel] FOREIGN KEY ([EmbeddingModelID]) REFERENCES [__mj].[AIModel] ([ID])
GO
ALTER TABLE [__mj].[VectorIndex] ADD CONSTRAINT [FK_VectorIndex_VectorDatabase] FOREIGN KEY ([VectorDatabaseID]) REFERENCES [__mj].[VectorDatabase] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[WorkflowRun]'
GO
ALTER TABLE [__mj].[WorkflowRun] ADD CONSTRAINT [FK_WorkflowRun_Workflow1] FOREIGN KEY ([WorkflowName]) REFERENCES [__mj].[Workflow] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [FK_Workflow_Company] FOREIGN KEY ([CompanyName]) REFERENCES [__mj].[Company] ([Name])
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [FK_Workflow_WorkflowEngine1] FOREIGN KEY ([WorkflowEngineName]) REFERENCES [__mj].[WorkflowEngine] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[WorkspaceItem]'
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD CONSTRAINT [FK__Workspace__Resou__73305268] FOREIGN KEY ([ResourceTypeID]) REFERENCES [__mj].[ResourceType] ([ID])
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD CONSTRAINT [FK__Workspace__WorkS__2C538F61] FOREIGN KEY ([WorkSpaceID]) REFERENCES [__mj].[Workspace] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Workspace]'
GO
ALTER TABLE [__mj].[Workspace] ADD CONSTRAINT [FK__Workspace__UserI__057AB683] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating extended properties'
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Data Context Items store information about each item within a Data Context. Each item stores a link to a view, query, or raw sql statement and can optionally cache the JSON representing the last run of that data object as well.', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Foreign key to the DataContext table', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'DataContextID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Optionally used to cache results of an item. This can be used for performance optimization, and also for having snapshots of data for historical comparisons.', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'DataJSON'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Used if type=''full_entity'' or type=''single_record''', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'EntityID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If DataJSON is populated, this field will show the date the the data was captured', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'LastRefreshedAt'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Only used if Type=''query''', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'QueryID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The Primary Key value for the record, only used when Type=''single_record''', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'RecordID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Only used when Type=sql', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'SQL'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The type of the item, either "view", "query", "full_entity", "single_record", or "sql"', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'Type'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Only used if Type=''view''', 'SCHEMA', N'__mj', 'TABLE', N'DataContextItem', 'COLUMN', N'ViewID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Data Contexts are a primitive within the MemberJunction architecture. They store information about data contexts which are groups of data including views, queries, or raw SQL statements. Data contexts can be used in conversations, reports and more.', 'SCHEMA', N'__mj', 'TABLE', N'DataContext', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Can be Pending, In Progress, Completed, or Failed', 'SCHEMA', N'__mj', 'TABLE', N'EntityDocumentRun', 'COLUMN', N'Status'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1 (default), whenever a description is modified in the column within the underlying view (first choice) or table (second choice), the Description column in the entity field definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity field definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'AutoUpdateDescription'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Used for display order in generated forms and in other places in the UI where relationships for an entity are shown', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'Sequence'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, a GraphQL query will be enabled that allows access to all rows in the entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AllowAllRowsAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Global flag controlling if creates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AllowCreateAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Global flag controlling if deletes are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AllowDeleteAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Global flag controlling if updates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AllowUpdateAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Enabling this bit will result in search being possible at the API and UI layers', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AllowUserSearchAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, accessing a record by an end-user will result in an Audit Log record being created', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AuditRecordAccess'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, users running a view against this entity will result in an Audit Log record being created.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AuditViewRuns'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1 (default), whenever a description is modified in the underlying view (first choice) or table (second choice), the Description column in the entity definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AutoUpdateDescription'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 0, CodeGen no longer generates a base view for the entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'BaseViewGenerated'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Set to 1 if a custom resolver has been created for the entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'CustomResolverAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 0, the entity will not be available at all in the GraphQL API or the object model.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'IncludeInAPI'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'TrackRecordChanges'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Pending, Uploading, Uploaded, Deleting, Deleted', 'SCHEMA', N'__mj', 'TABLE', N'File', 'COLUMN', N'Status'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn''t include type parameters. The SQLFullType field provides that information.', 'SCHEMA', N'__mj', 'TABLE', N'QueryField', 'COLUMN', N'SQLBaseType'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The full SQL type for the field, for example datetime or nvarchar(10) etc.', 'SCHEMA', N'__mj', 'TABLE', N'QueryField', 'COLUMN', N'SQLFullType'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Description of the role', 'SCHEMA', N'__mj', 'TABLE', N'Role', 'COLUMN', N'Description'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The unique ID of the role in the directory being used for authentication, for example an ID in Azure.', 'SCHEMA', N'__mj', 'TABLE', N'Role', 'COLUMN', N'DirectoryID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The name of the role in the database, this is used for auto-generating permission statements by CodeGen', 'SCHEMA', N'__mj', 'TABLE', N'Role', 'COLUMN', N'SQLName'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, comments the administrator wants to save for each installed version', 'SCHEMA', N'__mj', 'TABLE', N'VersionInstallation', 'COLUMN', N'Comments'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Any logging that was saved from the installation process', 'SCHEMA', N'__mj', 'TABLE', N'VersionInstallation', 'COLUMN', N'InstallLog'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Pending, Complete, Failed', 'SCHEMA', N'__mj', 'TABLE', N'VersionInstallation', 'COLUMN', N'Status'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'What type of installation was applied', 'SCHEMA', N'__mj', 'TABLE', N'VersionInstallation', 'COLUMN', N'Type'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', 'If set to 1, the workflow will be run automatically on the interval specified by the AutoRunIntervalType and AutoRunInterval fields', 'SCHEMA', N'__mj', 'TABLE', N'Workflow', 'COLUMN', N'AutoRunEnabled'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', 'The interval, denominated in the units specified in the AutoRunIntervalUnits column, between auto runs of this workflow.', 'SCHEMA', N'__mj', 'TABLE', N'Workflow', 'COLUMN', N'AutoRunInterval'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', 'Minutes, Hours, Days, Weeks, Months, Years', 'SCHEMA', N'__mj', 'TABLE', N'Workflow', 'COLUMN', N'AutoRunIntervalUnits'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', 'If specified, this subclass key, via the ClassFactory, will be instantiated, to execute this workflow. If not specified the WorkflowBase class will be used by default.', 'SCHEMA', N'__mj', 'TABLE', N'Workflow', 'COLUMN', N'SubclassName'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateApplicationEntity]'
GO
GRANT EXECUTE ON  [__mj].[spCreateApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateApplication]'
GO
GRANT EXECUTE ON  [__mj].[spCreateApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateAuditLog]'
GO
GRANT EXECUTE ON  [__mj].[spCreateAuditLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateAuditLog] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateAuditLog] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateCompanyIntegrationRecordMap]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCompanyIntegrationRecordMap] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCompanyIntegrationRecordMap] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateCompany]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCompany] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCompany] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateCompany] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateConversationDetail]'
GO
GRANT EXECUTE ON  [__mj].[spCreateConversationDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateConversationDetail] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateConversationDetail] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateConversation]'
GO
GRANT EXECUTE ON  [__mj].[spCreateConversation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateConversation] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateConversation] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateDashboardCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDashboardCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateDashboardCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateDashboardCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateDashboard]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDashboard] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateDataContextItem]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDataContextItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateDataContextItem] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateDataContextItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateDataContext]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDataContext] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateDataContext] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateDataContext] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEmployee]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEmployee] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEmployee] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityDocumentRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityDocumentType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityDocument]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocument] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocument] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityField]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityPermission]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityRecordDocument]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRecordDocument] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRecordDocument] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityRelationship]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRelationship] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRelationship] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntity]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateFileCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateFileCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateFileCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateFileEntityRecordLink]'
GO
GRANT EXECUTE ON  [__mj].[spCreateFileEntityRecordLink] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateFileEntityRecordLink] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateFileStorageProvider]'
GO
GRANT EXECUTE ON  [__mj].[spCreateFileStorageProvider] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateFileStorageProvider] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateFile]'
GO
GRANT EXECUTE ON  [__mj].[spCreateFile] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateFile] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateListDetail]'
GO
GRANT EXECUTE ON  [__mj].[spCreateListDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateListDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateList]'
GO
GRANT EXECUTE ON  [__mj].[spCreateList] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateList] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateQueryCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateQueryCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateQueryCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateQueryField]'
GO
GRANT EXECUTE ON  [__mj].[spCreateQueryField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateQueryField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateQueryPermission]'
GO
GRANT EXECUTE ON  [__mj].[spCreateQueryPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateQueryPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateQuery]'
GO
GRANT EXECUTE ON  [__mj].[spCreateQuery] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateQuery] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateQueueTask]'
GO
GRANT EXECUTE ON  [__mj].[spCreateQueueTask] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateQueue]'
GO
GRANT EXECUTE ON  [__mj].[spCreateQueue] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecordChange]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecordMergeDeletionLog]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordMergeDeletionLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordMergeDeletionLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecordMergeLog]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordMergeLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordMergeLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateReportCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateReportCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateReportCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateReportSnapshot]'
GO
GRANT EXECUTE ON  [__mj].[spCreateReportSnapshot] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateReport]'
GO
GRANT EXECUTE ON  [__mj].[spCreateReport] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRole]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateSchemaInfo]'
GO
GRANT EXECUTE ON  [__mj].[spCreateSchemaInfo] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateSchemaInfo] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserApplicationEntity]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserFavorite]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserFavorite] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserFavorite] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserFavorite] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserNotification]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserNotification] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserNotification] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserNotification] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserRole]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserViewCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserViewRunDetail]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserViewRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewRun] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserViewRun] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserView]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserView] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserView] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserView] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateUser]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUser] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUser] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateVectorDatabase]'
GO
GRANT EXECUTE ON  [__mj].[spCreateVectorDatabase] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateVectorDatabase] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateVectorIndex]'
GO
GRANT EXECUTE ON  [__mj].[spCreateVectorIndex] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateVectorIndex] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateVersionInstallation]'
GO
GRANT EXECUTE ON  [__mj].[spCreateVersionInstallation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateVersionInstallation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateWorkspaceItem]'
GO
GRANT EXECUTE ON  [__mj].[spCreateWorkspaceItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateWorkspace]'
GO
GRANT EXECUTE ON  [__mj].[spCreateWorkspace] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateWorkspace] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateWorkspace] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteApplicationEntity]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteApplication]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteCompany]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteCompany] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteCompany] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteConversation]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteConversation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteConversation] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteConversation] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteDashboardCategory]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteDashboardCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteDashboardCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteDashboardCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteDashboard]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteDashboard] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEmployee]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEmployee] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteEmployee] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityField]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityPermission]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityRelationship]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityRelationship] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityRelationship] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntity]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteFileCategory]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteFileCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteFileCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteFileCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteFile]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteFile] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteFile] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteListDetail]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteListDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteListDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteList]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteList] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteList] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteQueryCategory]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteQueryCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteQueryCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteQueryCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteReportCategory]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteReportCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteReportCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteReportCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteReportSnapshot]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteReportSnapshot] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteReport]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteReport] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteRole]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteTaggedItem]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteTaggedItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUserApplicationEntity]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUserApplication]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUserFavorite]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserFavorite] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserFavorite] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserFavorite] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUserRole]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUserViewCategory]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserViewCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserViewCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserViewCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUserView]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserView] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserView] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUserView] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteUser]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteUser] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteUser] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteWorkspaceItem]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteWorkspaceItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteWorkspace]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteWorkspace] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteWorkspace] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteWorkspace] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateAIModelAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIModelAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIModelAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateAIModelType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIModelType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIModelType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateAIModel]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIModel] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateAIModel] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateApplicationEntity]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateApplication]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCompanyIntegrationRecordMap]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRecordMap] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRecordMap] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCompanyIntegrationRunAPILog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCompanyIntegrationRunDetail]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCompanyIntegrationRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegrationRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCompanyIntegration]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegration] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompanyIntegration] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCompany]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompany] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompany] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCompany] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateConversationDetail]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateConversationDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateConversationDetail] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateConversationDetail] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateConversation]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateConversation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateConversation] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateConversation] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateDashboardCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDashboardCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDashboardCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDashboardCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateDashboard]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDashboard] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateDataContextItem]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDataContextItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDataContextItem] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDataContextItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateDataContext]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDataContext] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDataContext] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDataContext] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEmployeeCompanyIntegration]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployeeCompanyIntegration] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployeeCompanyIntegration] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEmployeeRole]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployeeRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployeeRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEmployeeSkill]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployeeSkill] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployeeSkill] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEmployee]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployee] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEmployee] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityAIAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityAIAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityDocumentRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityDocumentType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityDocument]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocument] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocument] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityField]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityPermission]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityRecordDocument]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRecordDocument] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRecordDocument] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityRelationship]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRelationship] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRelationship] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntity]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateErrorLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateErrorLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateErrorLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateFileCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateFileEntityRecordLink]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileEntityRecordLink] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileEntityRecordLink] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateFileStorageProvider]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileStorageProvider] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateFileStorageProvider] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateFile]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateFile] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateFile] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateIntegrationURLFormat]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateIntegrationURLFormat] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateIntegrationURLFormat] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateIntegration]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateIntegration] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateIntegration] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateListDetail]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateListDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateListDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateList]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateList] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateList] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateQueryCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateQueryField]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateQueryPermission]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateQueryPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateQuery]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateQuery] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateQuery] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecordMergeDeletionLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordMergeDeletionLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordMergeDeletionLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecordMergeLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordMergeLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordMergeLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateReportCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateReportCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateReportCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateReportCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateReportSnapshot]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateReportSnapshot] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateReport]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateReport] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRole]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateSchemaInfo]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateSchemaInfo] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateSchemaInfo] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserApplicationEntity]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserApplication]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserFavorite]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserFavorite] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserFavorite] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserFavorite] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserNotification]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserNotification] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserNotification] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserNotification] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserRecordLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserRecordLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserRecordLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserViewCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewCategory] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewCategory] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserViewRunDetail]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserViewRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserViewRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUserView]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserView] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserView] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUserView] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateUser]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateUser] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateUser] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateVectorDatabase]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateVectorDatabase] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateVectorDatabase] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateVectorIndex]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateVectorIndex] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateVectorIndex] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateVersionInstallation]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateVersionInstallation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateVersionInstallation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateWorkflowEngine]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkflowEngine] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkflowEngine] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateWorkflowRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkflowRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkflowRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateWorkflow]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkflow] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkflow] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateWorkspaceItem]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkspaceItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkspaceItem] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkspaceItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateWorkspace]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkspace] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkspace] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spUpdateWorkspace] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAIActions]'
GO
GRANT SELECT ON  [__mj].[vwAIActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAIActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAIActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAIModelActions]'
GO
GRANT SELECT ON  [__mj].[vwAIModelActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAIModelActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAIModelActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAIModelTypes]'
GO
GRANT SELECT ON  [__mj].[vwAIModelTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAIModelTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAIModelTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAIModels]'
GO
GRANT SELECT ON  [__mj].[vwAIModels] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAIModels] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAIModels] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwApplicationEntities]'
GO
GRANT SELECT ON  [__mj].[vwApplicationEntities] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwApplicationEntities] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwApplicationEntities] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwApplications]'
GO
GRANT SELECT ON  [__mj].[vwApplications] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwApplications] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwApplications] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAuditLogTypes]'
GO
GRANT SELECT ON  [__mj].[vwAuditLogTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAuditLogTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAuditLogTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAuditLogs]'
GO
GRANT SELECT ON  [__mj].[vwAuditLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAuditLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAuditLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAuthorizationRoles]'
GO
GRANT SELECT ON  [__mj].[vwAuthorizationRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAuthorizationRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAuthorizationRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwAuthorizations]'
GO
GRANT SELECT ON  [__mj].[vwAuthorizations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwAuthorizations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwAuthorizations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCompanies]'
GO
GRANT SELECT ON  [__mj].[vwCompanies] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCompanies] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCompanies] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCompanyIntegrationRecordMaps]'
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRecordMaps] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRecordMaps] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRecordMaps] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCompanyIntegrationRunAPILogs]'
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRunAPILogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRunAPILogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRunAPILogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCompanyIntegrationRunDetails]'
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRunDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRunDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRunDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCompanyIntegrationRuns]'
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrationRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCompanyIntegrations]'
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCompanyIntegrations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwConversationDetails]'
GO
GRANT SELECT ON  [__mj].[vwConversationDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwConversationDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwConversationDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwConversations]'
GO
GRANT SELECT ON  [__mj].[vwConversations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwConversations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwConversations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDashboardCategories]'
GO
GRANT SELECT ON  [__mj].[vwDashboardCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDashboardCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDashboardCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDashboards]'
GO
GRANT SELECT ON  [__mj].[vwDashboards] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDataContextItems]'
GO
GRANT SELECT ON  [__mj].[vwDataContextItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDataContextItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDataContextItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDataContexts]'
GO
GRANT SELECT ON  [__mj].[vwDataContexts] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDataContexts] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDataContexts] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDatasetItems]'
GO
GRANT SELECT ON  [__mj].[vwDatasetItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDatasetItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDatasetItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDatasets]'
GO
GRANT SELECT ON  [__mj].[vwDatasets] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDatasets] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDatasets] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEmployeeCompanyIntegrations]'
GO
GRANT SELECT ON  [__mj].[vwEmployeeCompanyIntegrations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEmployeeCompanyIntegrations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEmployeeCompanyIntegrations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEmployeeRoles]'
GO
GRANT SELECT ON  [__mj].[vwEmployeeRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEmployeeRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEmployeeRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEmployeeSkills]'
GO
GRANT SELECT ON  [__mj].[vwEmployeeSkills] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEmployeeSkills] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEmployeeSkills] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEmployees]'
GO
GRANT SELECT ON  [__mj].[vwEmployees] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEmployees] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEmployees] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntities]'
GO
GRANT SELECT ON  [__mj].[vwEntities] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntities] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntities] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityAIActions]'
GO
GRANT SELECT ON  [__mj].[vwEntityAIActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityAIActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityAIActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityDocumentRuns]'
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityDocumentTypes]'
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityDocuments]'
GO
GRANT SELECT ON  [__mj].[vwEntityDocuments] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityDocuments] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityDocuments] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityFieldValues]'
GO
GRANT SELECT ON  [__mj].[vwEntityFieldValues] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityFieldValues] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityFieldValues] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityFields]'
GO
GRANT SELECT ON  [__mj].[vwEntityFields] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityFields] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityFields] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityPermissions]'
GO
GRANT SELECT ON  [__mj].[vwEntityPermissions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityPermissions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityPermissions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityRecordDocuments]'
GO
GRANT SELECT ON  [__mj].[vwEntityRecordDocuments] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityRecordDocuments] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityRecordDocuments] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityRelationships]'
GO
GRANT SELECT ON  [__mj].[vwEntityRelationships] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityRelationships] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityRelationships] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwErrorLogs]'
GO
GRANT SELECT ON  [__mj].[vwErrorLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwErrorLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwErrorLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwFileCategories]'
GO
GRANT SELECT ON  [__mj].[vwFileCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwFileCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwFileCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwFileEntityRecordLinks]'
GO
GRANT SELECT ON  [__mj].[vwFileEntityRecordLinks] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwFileEntityRecordLinks] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwFileEntityRecordLinks] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwFileStorageProviders]'
GO
GRANT SELECT ON  [__mj].[vwFileStorageProviders] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwFileStorageProviders] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwFileStorageProviders] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwFiles]'
GO
GRANT SELECT ON  [__mj].[vwFiles] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwFiles] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwFiles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwIntegrationURLFormats]'
GO
GRANT SELECT ON  [__mj].[vwIntegrationURLFormats] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwIntegrationURLFormats] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwIntegrationURLFormats] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwIntegrations]'
GO
GRANT SELECT ON  [__mj].[vwIntegrations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwIntegrations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwIntegrations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwListDetails]'
GO
GRANT SELECT ON  [__mj].[vwListDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwListDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwListDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwLists]'
GO
GRANT SELECT ON  [__mj].[vwLists] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwLists] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwLists] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwOutputDeliveryTypes]'
GO
GRANT SELECT ON  [__mj].[vwOutputDeliveryTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwOutputFormatTypes]'
GO
GRANT SELECT ON  [__mj].[vwOutputFormatTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwOutputTriggerTypes]'
GO
GRANT SELECT ON  [__mj].[vwOutputTriggerTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueries]'
GO
GRANT SELECT ON  [__mj].[vwQueries] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwQueries] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwQueries] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueryCategories]'
GO
GRANT SELECT ON  [__mj].[vwQueryCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwQueryCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwQueryCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueryFields]'
GO
GRANT SELECT ON  [__mj].[vwQueryFields] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwQueryFields] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwQueryFields] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueryPermissions]'
GO
GRANT SELECT ON  [__mj].[vwQueryPermissions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwQueryPermissions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwQueryPermissions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueueTasks]'
GO
GRANT SELECT ON  [__mj].[vwQueueTasks] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueueTypes]'
GO
GRANT SELECT ON  [__mj].[vwQueueTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwQueueTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwQueues]'
GO
GRANT SELECT ON  [__mj].[vwQueues] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecordChanges]'
GO
GRANT SELECT ON  [__mj].[vwRecordChanges] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecordChanges] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecordChanges] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecordMergeDeletionLogs]'
GO
GRANT SELECT ON  [__mj].[vwRecordMergeDeletionLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecordMergeDeletionLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecordMergeDeletionLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecordMergeLogs]'
GO
GRANT SELECT ON  [__mj].[vwRecordMergeLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecordMergeLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecordMergeLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwReportCategories]'
GO
GRANT SELECT ON  [__mj].[vwReportCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwReportCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwReportCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwReportSnapshots]'
GO
GRANT SELECT ON  [__mj].[vwReportSnapshots] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwReports]'
GO
GRANT SELECT ON  [__mj].[vwReports] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwResourceTypes]'
GO
GRANT SELECT ON  [__mj].[vwResourceTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRoles]'
GO
GRANT SELECT ON  [__mj].[vwRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRowLevelSecurityFilters]'
GO
GRANT SELECT ON  [__mj].[vwRowLevelSecurityFilters] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRowLevelSecurityFilters] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRowLevelSecurityFilters] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwSchemaInfos]'
GO
GRANT SELECT ON  [__mj].[vwSchemaInfos] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwSchemaInfos] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwSchemaInfos] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwSkills]'
GO
GRANT SELECT ON  [__mj].[vwSkills] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwSkills] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwSkills] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwTaggedItems]'
GO
GRANT SELECT ON  [__mj].[vwTaggedItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwTags]'
GO
GRANT SELECT ON  [__mj].[vwTags] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserApplicationEntities]'
GO
GRANT SELECT ON  [__mj].[vwUserApplicationEntities] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserApplicationEntities] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserApplicationEntities] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserApplications]'
GO
GRANT SELECT ON  [__mj].[vwUserApplications] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserApplications] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserApplications] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserFavorites]'
GO
GRANT SELECT ON  [__mj].[vwUserFavorites] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserFavorites] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserFavorites] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserNotifications]'
GO
GRANT SELECT ON  [__mj].[vwUserNotifications] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserNotifications] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserNotifications] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserRecordLogs]'
GO
GRANT SELECT ON  [__mj].[vwUserRecordLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserRecordLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserRecordLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserRoles]'
GO
GRANT SELECT ON  [__mj].[vwUserRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserViewCategories]'
GO
GRANT SELECT ON  [__mj].[vwUserViewCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserViewCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserViewCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserViewRunDetails]'
GO
GRANT SELECT ON  [__mj].[vwUserViewRunDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserViewRunDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserViewRunDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserViewRuns]'
GO
GRANT SELECT ON  [__mj].[vwUserViewRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserViewRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserViewRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUserViews]'
GO
GRANT SELECT ON  [__mj].[vwUserViews] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUserViews] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUserViews] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwUsers]'
GO
GRANT SELECT ON  [__mj].[vwUsers] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwUsers] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwUsers] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwVectorDatabases]'
GO
GRANT SELECT ON  [__mj].[vwVectorDatabases] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwVectorDatabases] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwVectorDatabases] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwVectorIndexes]'
GO
GRANT SELECT ON  [__mj].[vwVectorIndexes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwVectorIndexes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwVectorIndexes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwVersionInstallations]'
GO
GRANT SELECT ON  [__mj].[vwVersionInstallations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwVersionInstallations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwVersionInstallations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwWorkflowEngines]'
GO
GRANT SELECT ON  [__mj].[vwWorkflowEngines] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwWorkflowEngines] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwWorkflowEngines] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwWorkflowRuns]'
GO
GRANT SELECT ON  [__mj].[vwWorkflowRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwWorkflowRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwWorkflowRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwWorkflows]'
GO
GRANT SELECT ON  [__mj].[vwWorkflows] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwWorkflows] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwWorkflows] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwWorkspaceItems]'
GO
GRANT SELECT ON  [__mj].[vwWorkspaceItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwWorkspaceItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwWorkspaceItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwWorkspaces]'
GO
GRANT SELECT ON  [__mj].[vwWorkspaces] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwWorkspaces] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwWorkspaces] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
COMMIT TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
-- This statement writes to the SQL Server Log so SQL Monitor can show this deployment.
IF HAS_PERMS_BY_NAME(N'sys.xp_logevent', N'OBJECT', N'EXECUTE') = 1
BEGIN
    DECLARE @databaseName AS nvarchar(2048), @eventMessage AS nvarchar(2048)
    SET @databaseName = REPLACE(REPLACE(DB_NAME(), N'\', N'\\'), N'"', N'\"')
    SET @eventMessage = N'Redgate SQL Compare: { "deployment": { "description": "Redgate SQL Compare deployed to ' + @databaseName + N'", "database": "' + @databaseName + N'" }}'
    EXECUTE sys.xp_logevent 55000, @eventMessage
END
GO
DECLARE @Success AS BIT
SET @Success = 1
SET NOEXEC OFF
IF (@Success = 1) PRINT 'The database update succeeded'
ELSE BEGIN
	IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
	PRINT 'The database update failed'
END
GO
