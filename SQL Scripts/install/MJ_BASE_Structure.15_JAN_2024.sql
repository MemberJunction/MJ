/*
You are recommended to back up your database before running this script

Script created by SQL Compare version 15.2.1.24235 from Red Gate Software Ltd at 1/15/2024 11:48:09 AM

*/
SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS ON
GO
SET XACT_ABORT ON
GO
SET TRANSACTION ISOLATION LEVEL Serializable
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
CREATE SCHEMA [admin]
AUTHORIZATION [dbo]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
CREATE SCHEMA [test]
AUTHORIZATION [dbo]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating types'
GO
CREATE TYPE [admin].[IDListTableType] AS TABLE
(
[ID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Conversation]'
GO
CREATE TABLE [admin].[Conversation]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[ExternalID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Conversation_DateCreated] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Conversation_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Conversation] on [admin].[Conversation]'
GO
ALTER TABLE [admin].[Conversation] ADD CONSTRAINT [PK_Conversation] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ConversationDetail]'
GO
CREATE TABLE [admin].[ConversationDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ConversationID] [int] NOT NULL,
[ExternalID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Role] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_ConversationDetail_Role] DEFAULT (user_name()),
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Error] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ConversationDetail_DateCreated] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ConversationDetail_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ConversationDetail] on [admin].[ConversationDetail]'
GO
ALTER TABLE [admin].[ConversationDetail] ADD CONSTRAINT [PK_ConversationDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[User]'
GO
CREATE TABLE [admin].[User]
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
PRINT N'Creating primary key [PK_ApplicationUser] on [admin].[User]'
GO
ALTER TABLE [admin].[User] ADD CONSTRAINT [PK_ApplicationUser] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Dashboard]'
GO
CREATE TABLE [admin].[Dashboard]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UIConfigDetails] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [int] NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Dashboard] on [admin].[Dashboard]'
GO
ALTER TABLE [admin].[Dashboard] ADD CONSTRAINT [PK_Dashboard] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Employee]'
GO
CREATE TABLE [admin].[Employee]
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
PRINT N'Creating primary key [PK__Employee__3214EC2755313CC7] on [admin].[Employee]'
GO
ALTER TABLE [admin].[Employee] ADD CONSTRAINT [PK__Employee__3214EC2755313CC7] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Employee]'
GO
ALTER TABLE [admin].[Employee] ADD CONSTRAINT [UQ__Employee__Email] UNIQUE NONCLUSTERED ([Email])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EmployeeRole]'
GO
CREATE TABLE [admin].[EmployeeRole]
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
PRINT N'Creating primary key [PK__Employee__C27FE3125986E6A3] on [admin].[EmployeeRole]'
GO
ALTER TABLE [admin].[EmployeeRole] ADD CONSTRAINT [PK__Employee__C27FE3125986E6A3] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Role]'
GO
CREATE TABLE [admin].[Role]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AzureID] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SQLName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Role_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Role_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Role__3214EC27B72328F8] on [admin].[Role]'
GO
ALTER TABLE [admin].[Role] ADD CONSTRAINT [PK__Role__3214EC27B72328F8] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Role]'
GO
ALTER TABLE [admin].[Role] ADD CONSTRAINT [UQ__Role__737584F6A210197E] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EmployeeSkill]'
GO
CREATE TABLE [admin].[EmployeeSkill]
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
PRINT N'Creating primary key [PK__Employee__172A46EF36387801] on [admin].[EmployeeSkill]'
GO
ALTER TABLE [admin].[EmployeeSkill] ADD CONSTRAINT [PK__Employee__172A46EF36387801] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Report]'
GO
CREATE TABLE [admin].[Report]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [int] NOT NULL,
[SharingScope] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Report_SharingScope] DEFAULT (N'Personal'),
[ConversationID] [int] NULL,
[ConversationDetailID] [int] NULL,
[ReportSQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ReportConfiguration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
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
PRINT N'Creating primary key [PK_Report] on [admin].[Report]'
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [PK_Report] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[OutputDeliveryType]'
GO
CREATE TABLE [admin].[OutputDeliveryType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputDeliveryType] on [admin].[OutputDeliveryType]'
GO
ALTER TABLE [admin].[OutputDeliveryType] ADD CONSTRAINT [PK_OutputDeliveryType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[OutputFormatType]'
GO
CREATE TABLE [admin].[OutputFormatType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayFormat] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputFormatType] on [admin].[OutputFormatType]'
GO
ALTER TABLE [admin].[OutputFormatType] ADD CONSTRAINT [PK_OutputFormatType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[OutputTriggerType]'
GO
CREATE TABLE [admin].[OutputTriggerType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputTriggerType] on [admin].[OutputTriggerType]'
GO
ALTER TABLE [admin].[OutputTriggerType] ADD CONSTRAINT [PK_OutputTriggerType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Workflow]'
GO
CREATE TABLE [admin].[Workflow]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[WorkflowEngineName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CompanyName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Workflow_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Workflow_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Workflow] on [admin].[Workflow]'
GO
ALTER TABLE [admin].[Workflow] ADD CONSTRAINT [PK_Workflow] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Workflow]'
GO
ALTER TABLE [admin].[Workflow] ADD CONSTRAINT [UQ_Workflow_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ReportSnapshot]'
GO
CREATE TABLE [admin].[ReportSnapshot]
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
PRINT N'Creating primary key [PK_ReportSnapshot] on [admin].[ReportSnapshot]'
GO
ALTER TABLE [admin].[ReportSnapshot] ADD CONSTRAINT [PK_ReportSnapshot] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Entity]'
GO
CREATE TABLE [admin].[Entity]
(
[ID] [int] NOT NULL,
[ParentID] [int] NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[NameSuffix] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
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
PRINT N'Creating primary key [PK_Entity] on [admin].[Entity]'
GO
ALTER TABLE [admin].[Entity] ADD CONSTRAINT [PK_Entity] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_Entity_Name] on [admin].[Entity]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_Entity_Name] ON [admin].[Entity] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ResourceType]'
GO
CREATE TABLE [admin].[ResourceType]
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
PRINT N'Creating primary key [PK_ResourceType] on [admin].[ResourceType]'
GO
ALTER TABLE [admin].[ResourceType] ADD CONSTRAINT [PK_ResourceType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[ResourceType]'
GO
ALTER TABLE [admin].[ResourceType] ADD CONSTRAINT [UQ_ResourceType_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[SystemEvent]'
GO
CREATE TABLE [admin].[SystemEvent]
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
PRINT N'Creating primary key [PK_SystemEvent] on [admin].[SystemEvent]'
GO
ALTER TABLE [admin].[SystemEvent] ADD CONSTRAINT [PK_SystemEvent] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[TaggedItem]'
GO
CREATE TABLE [admin].[TaggedItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[TagID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TaggedItem] on [admin].[TaggedItem]'
GO
ALTER TABLE [admin].[TaggedItem] ADD CONSTRAINT [PK_TaggedItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Tag]'
GO
CREATE TABLE [admin].[Tag]
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
PRINT N'Creating primary key [PK_Tag] on [admin].[Tag]'
GO
ALTER TABLE [admin].[Tag] ADD CONSTRAINT [PK_Tag] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[WorkspaceItem]'
GO
CREATE TABLE [admin].[WorkspaceItem]
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
PRINT N'Creating primary key [PK_WorkspaceItem] on [admin].[WorkspaceItem]'
GO
ALTER TABLE [admin].[WorkspaceItem] ADD CONSTRAINT [PK_WorkspaceItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Workspace]'
GO
CREATE TABLE [admin].[Workspace]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Workspace] on [admin].[Workspace]'
GO
ALTER TABLE [admin].[Workspace] ADD CONSTRAINT [PK_Workspace] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AIModel]'
GO
CREATE TABLE [admin].[AIModel]
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
PRINT N'Creating primary key [PK_AIModel] on [admin].[AIModel]'
GO
ALTER TABLE [admin].[AIModel] ADD CONSTRAINT [PK_AIModel] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AIAction]'
GO
CREATE TABLE [admin].[AIAction]
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
PRINT N'Creating primary key [PK_AIAction] on [admin].[AIAction]'
GO
ALTER TABLE [admin].[AIAction] ADD CONSTRAINT [PK_AIAction] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AIModelType]'
GO
CREATE TABLE [admin].[AIModelType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModelType] on [admin].[AIModelType]'
GO
ALTER TABLE [admin].[AIModelType] ADD CONSTRAINT [PK_AIModelType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AIModelAction]'
GO
CREATE TABLE [admin].[AIModelAction]
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
PRINT N'Creating primary key [PK_AIModelAction] on [admin].[AIModelAction]'
GO
ALTER TABLE [admin].[AIModelAction] ADD CONSTRAINT [PK_AIModelAction] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Application]'
GO
CREATE TABLE [admin].[Application]
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
PRINT N'Creating primary key [PK_Application] on [admin].[Application]'
GO
ALTER TABLE [admin].[Application] ADD CONSTRAINT [PK_Application] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Application]'
GO
ALTER TABLE [admin].[Application] ADD CONSTRAINT [UQ_Application_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ApplicationEntity]'
GO
CREATE TABLE [admin].[ApplicationEntity]
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
PRINT N'Creating primary key [PK_ApplicationEntity] on [admin].[ApplicationEntity]'
GO
ALTER TABLE [admin].[ApplicationEntity] ADD CONSTRAINT [PK_ApplicationEntity] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AuditLogType]'
GO
CREATE TABLE [admin].[AuditLogType]
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
PRINT N'Creating primary key [PK_AuditType] on [admin].[AuditLogType]'
GO
ALTER TABLE [admin].[AuditLogType] ADD CONSTRAINT [PK_AuditType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[AuditLogType]'
GO
ALTER TABLE [admin].[AuditLogType] ADD CONSTRAINT [UQ_AuditLogType] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AuditLog]'
GO
CREATE TABLE [admin].[AuditLog]
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
PRINT N'Creating primary key [PK_AuditLog] on [admin].[AuditLog]'
GO
ALTER TABLE [admin].[AuditLog] ADD CONSTRAINT [PK_AuditLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Authorization]'
GO
CREATE TABLE [admin].[Authorization]
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
PRINT N'Creating primary key [PK_Authorization] on [admin].[Authorization]'
GO
ALTER TABLE [admin].[Authorization] ADD CONSTRAINT [PK_Authorization] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Authorization]'
GO
ALTER TABLE [admin].[Authorization] ADD CONSTRAINT [UQ_Authorization] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[AuthorizationRole]'
GO
CREATE TABLE [admin].[AuthorizationRole]
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
PRINT N'Creating primary key [PK_AuthorizationRole] on [admin].[AuthorizationRole]'
GO
ALTER TABLE [admin].[AuthorizationRole] ADD CONSTRAINT [PK_AuthorizationRole] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Company]'
GO
CREATE TABLE [admin].[Company]
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
PRINT N'Creating primary key [PK__Company__3214EC278DAF44DD] on [admin].[Company]'
GO
ALTER TABLE [admin].[Company] ADD CONSTRAINT [PK__Company__3214EC278DAF44DD] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Company]'
GO
ALTER TABLE [admin].[Company] ADD CONSTRAINT [UQ_Company_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[CompanyIntegration]'
GO
CREATE TABLE [admin].[CompanyIntegration]
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
PRINT N'Creating primary key [PK__CompanyI__3214EC2739C558AB] on [admin].[CompanyIntegration]'
GO
ALTER TABLE [admin].[CompanyIntegration] ADD CONSTRAINT [PK__CompanyI__3214EC2739C558AB] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Integration]'
GO
CREATE TABLE [admin].[Integration]
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
PRINT N'Creating primary key [PK__Integrat__3214EC27B672ECF0] on [admin].[Integration]'
GO
ALTER TABLE [admin].[Integration] ADD CONSTRAINT [PK__Integrat__3214EC27B672ECF0] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Integration]'
GO
ALTER TABLE [admin].[Integration] ADD CONSTRAINT [UQ_Integration_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[CompanyIntegrationRecordMap]'
GO
CREATE TABLE [admin].[CompanyIntegrationRecordMap]
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
PRINT N'Creating primary key [PK_CompanyIntegrationRecordMap] on [admin].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [admin].[CompanyIntegrationRecordMap] ADD CONSTRAINT [PK_CompanyIntegrationRecordMap] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[CompanyIntegrationRun]'
GO
CREATE TABLE [admin].[CompanyIntegrationRun]
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
PRINT N'Creating primary key [PK_CompanyIntegrationRun] on [admin].[CompanyIntegrationRun]'
GO
ALTER TABLE [admin].[CompanyIntegrationRun] ADD CONSTRAINT [PK_CompanyIntegrationRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[CompanyIntegrationRunAPILog]'
GO
CREATE TABLE [admin].[CompanyIntegrationRunAPILog]
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
PRINT N'Creating primary key [PK_CompanyIntegrationRunAPICall] on [admin].[CompanyIntegrationRunAPILog]'
GO
ALTER TABLE [admin].[CompanyIntegrationRunAPILog] ADD CONSTRAINT [PK_CompanyIntegrationRunAPICall] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[CompanyIntegrationRunDetail]'
GO
CREATE TABLE [admin].[CompanyIntegrationRunDetail]
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
PRINT N'Creating primary key [PK_CompanyIntegrationRunDetail] on [admin].[CompanyIntegrationRunDetail]'
GO
ALTER TABLE [admin].[CompanyIntegrationRunDetail] ADD CONSTRAINT [PK_CompanyIntegrationRunDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Dataset]'
GO
CREATE TABLE [admin].[Dataset]
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
PRINT N'Creating primary key [PK_Dataset] on [admin].[Dataset]'
GO
ALTER TABLE [admin].[Dataset] ADD CONSTRAINT [PK_Dataset] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[Dataset]'
GO
ALTER TABLE [admin].[Dataset] ADD CONSTRAINT [UQ_Dataset_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[DatasetItem]'
GO
CREATE TABLE [admin].[DatasetItem]
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
PRINT N'Creating primary key [PK_DatasetItem] on [admin].[DatasetItem]'
GO
ALTER TABLE [admin].[DatasetItem] ADD CONSTRAINT [PK_DatasetItem] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EmployeeCompanyIntegration]'
GO
CREATE TABLE [admin].[EmployeeCompanyIntegration]
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
PRINT N'Creating primary key [PK_EmployeeCompanyIntegration] on [admin].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [admin].[EmployeeCompanyIntegration] ADD CONSTRAINT [PK_EmployeeCompanyIntegration] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Skill]'
GO
CREATE TABLE [admin].[Skill]
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
PRINT N'Creating primary key [PK_Skill] on [admin].[Skill]'
GO
ALTER TABLE [admin].[Skill] ADD CONSTRAINT [PK_Skill] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EntityAIAction]'
GO
CREATE TABLE [admin].[EntityAIAction]
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
PRINT N'Creating primary key [PK_EntityAIAction] on [admin].[EntityAIAction]'
GO
ALTER TABLE [admin].[EntityAIAction] ADD CONSTRAINT [PK_EntityAIAction] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EntityField]'
GO
CREATE TABLE [admin].[EntityField]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_EntityField_Sequence] DEFAULT ((0)),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
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
PRINT N'Creating primary key [PK_EntityField] on [admin].[EntityField]'
GO
ALTER TABLE [admin].[EntityField] ADD CONSTRAINT [PK_EntityField] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_EntityField_EntityID_Name] on [admin].[EntityField]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_EntityField_EntityID_Name] ON [admin].[EntityField] ([EntityID], [Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EntityFieldValue]'
GO
CREATE TABLE [admin].[EntityFieldValue]
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
PRINT N'Creating primary key [PK_EntityFieldValue] on [admin].[EntityFieldValue]'
GO
ALTER TABLE [admin].[EntityFieldValue] ADD CONSTRAINT [PK_EntityFieldValue] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[RowLevelSecurityFilter]'
GO
CREATE TABLE [admin].[RowLevelSecurityFilter]
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
PRINT N'Creating primary key [PK_RowLevelSecurityFilter] on [admin].[RowLevelSecurityFilter]'
GO
ALTER TABLE [admin].[RowLevelSecurityFilter] ADD CONSTRAINT [PK_RowLevelSecurityFilter] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EntityPermission]'
GO
CREATE TABLE [admin].[EntityPermission]
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
PRINT N'Creating primary key [PK_EntityPermission] on [admin].[EntityPermission]'
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [PK_EntityPermission] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[EntityRelationship]'
GO
CREATE TABLE [admin].[EntityRelationship]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
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
PRINT N'Creating primary key [PK_admin.EntityRelationships] on [admin].[EntityRelationship]'
GO
ALTER TABLE [admin].[EntityRelationship] ADD CONSTRAINT [PK_admin.EntityRelationships] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserView]'
GO
CREATE TABLE [admin].[UserView]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[GUID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_UserView_UniqueCode] DEFAULT (newid()),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
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
PRINT N'Creating primary key [PK_UserView] on [admin].[UserView]'
GO
ALTER TABLE [admin].[UserView] ADD CONSTRAINT [PK_UserView] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[UserView]'
GO
ALTER TABLE [admin].[UserView] ADD CONSTRAINT [UQ_UserView_GUID] UNIQUE NONCLUSTERED ([GUID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ErrorLog]'
GO
CREATE TABLE [admin].[ErrorLog]
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
PRINT N'Creating primary key [PK_ErrorLog] on [admin].[ErrorLog]'
GO
ALTER TABLE [admin].[ErrorLog] ADD CONSTRAINT [PK_ErrorLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[IntegrationURLFormat]'
GO
CREATE TABLE [admin].[IntegrationURLFormat]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[IntegrationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [int] NOT NULL,
[URLFormat] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_IntegrationURLFormat] on [admin].[IntegrationURLFormat]'
GO
ALTER TABLE [admin].[IntegrationURLFormat] ADD CONSTRAINT [PK_IntegrationURLFormat] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[List]'
GO
CREATE TABLE [admin].[List]
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
PRINT N'Creating primary key [PK_List] on [admin].[List]'
GO
ALTER TABLE [admin].[List] ADD CONSTRAINT [PK_List] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_List_Name] on [admin].[List]'
GO
CREATE NONCLUSTERED INDEX [IX_List_Name] ON [admin].[List] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ListDetail]'
GO
CREATE TABLE [admin].[ListDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ListID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_ListDetail_Sequence] DEFAULT ((0))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ListDetail] on [admin].[ListDetail]'
GO
ALTER TABLE [admin].[ListDetail] ADD CONSTRAINT [PK_ListDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[QueueType]'
GO
CREATE TABLE [admin].[QueueType]
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
PRINT N'Creating primary key [PK_QueueType] on [admin].[QueueType]'
GO
ALTER TABLE [admin].[QueueType] ADD CONSTRAINT [PK_QueueType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[Queue]'
GO
CREATE TABLE [admin].[Queue]
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
PRINT N'Creating primary key [PK_Queue] on [admin].[Queue]'
GO
ALTER TABLE [admin].[Queue] ADD CONSTRAINT [PK_Queue] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[QueueTask]'
GO
CREATE TABLE [admin].[QueueTask]
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
PRINT N'Creating primary key [PK_QueueTask] on [admin].[QueueTask]'
GO
ALTER TABLE [admin].[QueueTask] ADD CONSTRAINT [PK_QueueTask] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[RecordChange]'
GO
CREATE TABLE [admin].[RecordChange]
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
PRINT N'Creating primary key [PK_RecordChange] on [admin].[RecordChange]'
GO
ALTER TABLE [admin].[RecordChange] ADD CONSTRAINT [PK_RecordChange] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[RecordMergeLog]'
GO
CREATE TABLE [admin].[RecordMergeLog]
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
PRINT N'Creating primary key [PK_RecordMergeLog] on [admin].[RecordMergeLog]'
GO
ALTER TABLE [admin].[RecordMergeLog] ADD CONSTRAINT [PK_RecordMergeLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[RecordMergeDeletionLog]'
GO
CREATE TABLE [admin].[RecordMergeDeletionLog]
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
PRINT N'Creating primary key [PK_RecordMergeDeletionLog] on [admin].[RecordMergeDeletionLog]'
GO
ALTER TABLE [admin].[RecordMergeDeletionLog] ADD CONSTRAINT [PK_RecordMergeDeletionLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ResourceFolder]'
GO
CREATE TABLE [admin].[ResourceFolder]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ParentID] [int] NULL,
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ResourceTypeName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ResourceFolder_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ResourceFolder_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewFolder] on [admin].[ResourceFolder]'
GO
ALTER TABLE [admin].[ResourceFolder] ADD CONSTRAINT [PK_UserViewFolder] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserApplication]'
GO
CREATE TABLE [admin].[UserApplication]
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
PRINT N'Creating primary key [PK_UserApplication] on [admin].[UserApplication]'
GO
ALTER TABLE [admin].[UserApplication] ADD CONSTRAINT [PK_UserApplication] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserApplicationEntity]'
GO
CREATE TABLE [admin].[UserApplicationEntity]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserApplicationID] [int] NOT NULL,
[EntityID] [int] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_UserApplicationEntity_Sequence] DEFAULT ((0))
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserApplicationEntity] on [admin].[UserApplicationEntity]'
GO
ALTER TABLE [admin].[UserApplicationEntity] ADD CONSTRAINT [PK_UserApplicationEntity] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserFavorite]'
GO
CREATE TABLE [admin].[UserFavorite]
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
PRINT N'Creating primary key [PK_UserFavorite_1] on [admin].[UserFavorite]'
GO
ALTER TABLE [admin].[UserFavorite] ADD CONSTRAINT [PK_UserFavorite_1] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserNotification]'
GO
CREATE TABLE [admin].[UserNotification]
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
PRINT N'Creating primary key [PK_UserNotification] on [admin].[UserNotification]'
GO
ALTER TABLE [admin].[UserNotification] ADD CONSTRAINT [PK_UserNotification] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserRecordLog]'
GO
CREATE TABLE [admin].[UserRecordLog]
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
PRINT N'Creating primary key [PK_UserRecordLog] on [admin].[UserRecordLog]'
GO
ALTER TABLE [admin].[UserRecordLog] ADD CONSTRAINT [PK_UserRecordLog] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserRole]'
GO
CREATE TABLE [admin].[UserRole]
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
PRINT N'Creating primary key [PK_UserRole] on [admin].[UserRole]'
GO
ALTER TABLE [admin].[UserRole] ADD CONSTRAINT [PK_UserRole] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserViewRun]'
GO
CREATE TABLE [admin].[UserViewRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserViewID] [int] NOT NULL,
[RunAt] [datetime] NOT NULL,
[RunByUserID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewRun] on [admin].[UserViewRun]'
GO
ALTER TABLE [admin].[UserViewRun] ADD CONSTRAINT [PK_UserViewRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[UserViewRunDetail]'
GO
CREATE TABLE [admin].[UserViewRunDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserViewRunID] [int] NOT NULL,
[RecordID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewRunDetail] on [admin].[UserViewRunDetail]'
GO
ALTER TABLE [admin].[UserViewRunDetail] ADD CONSTRAINT [PK_UserViewRunDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[WorkflowEngine]'
GO
CREATE TABLE [admin].[WorkflowEngine]
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
PRINT N'Creating primary key [PK_WorkflowEngine] on [admin].[WorkflowEngine]'
GO
ALTER TABLE [admin].[WorkflowEngine] ADD CONSTRAINT [PK_WorkflowEngine] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[WorkflowEngine]'
GO
ALTER TABLE [admin].[WorkflowEngine] ADD CONSTRAINT [IX_WorkflowEngine] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[WorkflowRun]'
GO
CREATE TABLE [admin].[WorkflowRun]
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
PRINT N'Creating primary key [PK_WorkflowRun] on [admin].[WorkflowRun]'
GO
ALTER TABLE [admin].[WorkflowRun] ADD CONSTRAINT [PK_WorkflowRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEntities]'
GO

CREATE VIEW [admin].[vwEntities]
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
	[admin].Entity e
LEFT OUTER JOIN 
	[admin].Entity par
ON
	e.ParentID = par.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateEntity]'
GO


CREATE PROCEDURE [admin].[spCreateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
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
    [admin].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
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
    SELECT * FROM [admin].[vwEntities] WHERE ID = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEntityFields]'
GO

CREATE VIEW [admin].[vwEntityFields]
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
	[admin].EntityField ef
INNER JOIN
	[admin].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
	[admin].vwEntities re ON ef.RelatedEntityID = re.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateEntityField]'
GO


CREATE PROCEDURE [admin].[spCreateEntityField]
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
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
    [admin].[EntityField]
        (
            [DisplayName],
            [Description],
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
    SELECT * FROM [admin].[vwEntityFields] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEmployees]'
GO

CREATE VIEW [admin].[vwEmployees] 
AS
SELECT
	e.*,
	TRIM(e.FirstName) + ' ' + TRIM(e.LastName) FirstLast,
	TRIM(s.FirstName) + ' ' + TRIM(s.LastName) Supervisor,
	s.FirstName SupervisorFirstName,
	s.LastName SupervisorLastName,
	s.Email SupervisorEmail
FROM
	admin.Employee e
LEFT OUTER JOIN
	admin.Employee s
ON
	e.SupervisorID = s.ID

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUsers]'
GO

CREATE VIEW [admin].[vwUsers] 
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
	[admin].[User] u
LEFT OUTER JOIN
	vwEmployees e
ON
	u.EmployeeID = e.ID

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUser]'
GO


CREATE PROCEDURE [admin].[spUpdateUser]
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
        [admin].[User]
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUsers] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEntityRelationships]'
GO

CREATE VIEW [admin].[vwEntityRelationships]
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
	[admin].EntityRelationship er
INNER JOIN
	[admin].Entity e
ON
	er.EntityID = e.ID
INNER JOIN
	[admin].vwEntities relatedEntity
ON
	er.RelatedEntityID = relatedEntity.ID
LEFT OUTER JOIN
	[admin].UserView uv
ON	
	er.DisplayUserViewGUID = uv.GUID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEntityRelationship]'
GO


CREATE PROCEDURE [admin].[spUpdateEntityRelationship]
    @ID int,
    @EntityID int,
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
        [admin].[EntityRelationship]
    SET 
        [EntityID] = @EntityID,
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEntityRelationships] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEntity]'
GO


CREATE PROCEDURE [admin].[spUpdateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
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
        [admin].[Entity]
    SET 
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEntityField]'
GO


CREATE PROCEDURE [admin].[spUpdateEntityField]
    @ID int,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
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
        [admin].[EntityField]
    SET 
        [DisplayName] = @DisplayName,
        [Description] = @Description,
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEntityFields] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteEntityRelationship]'
GO


CREATE PROCEDURE [admin].[spDeleteEntityRelationship]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[EntityRelationship]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteEntity]'
GO


CREATE PROCEDURE [admin].[spDeleteEntity]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[Entity]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteEntityField]'
GO


CREATE PROCEDURE [admin].[spDeleteEntityField]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[EntityField]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwErrorLogs]'
GO


CREATE VIEW [admin].[vwErrorLogs]
AS
SELECT 
    e.*
FROM
    [admin].[ErrorLog] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanyIntegrationRuns]'
GO


CREATE VIEW [admin].[vwCompanyIntegrationRuns]
AS
SELECT 
    c.*,
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [admin].[CompanyIntegrationRun] AS c
INNER JOIN
    [admin].[User] AS User_RunByUserID
  ON
    [c].[RunByUserID] = User_RunByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanyIntegrationRunDetails]'
GO

CREATE VIEW [admin].[vwCompanyIntegrationRunDetails]
AS
SELECT 
    cird.*,
	e.Name Entity,
	cir.StartedAt RunStartedAt,
	cir.EndedAt RunEndedAt
FROM
	admin.CompanyIntegrationRunDetail cird
INNER JOIN
    admin.CompanyIntegrationRun cir
ON
    cird.CompanyIntegrationRunID = cir.ID
INNER JOIN
	admin.Entity e
ON
	cird.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateCompanyIntegrationRunDetail]'
GO


CREATE PROCEDURE [admin].[spUpdateCompanyIntegrationRunDetail]
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
        [admin].[CompanyIntegrationRunDetail]
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
    SELECT * FROM [admin].[vwCompanyIntegrationRunDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserViews]'
GO

CREATE VIEW [admin].[vwUserViews]
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
	admin.UserView uv
INNER JOIN
	[admin].vwUsers u
ON
	uv.UserID = u.ID
INNER JOIN
	admin.Entity e
ON
	uv.EntityID = e.ID


GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserView]'
GO


CREATE PROCEDURE [admin].[spCreateUserView]
    @UserID int,
    @EntityID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
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
    [admin].[UserView]
        (
            [UserID],
            [EntityID],
            [Name],
            [Description],
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
    SELECT * FROM [admin].[vwUserViews] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserRecordLogs]'
GO

CREATE VIEW [admin].[vwUserRecordLogs] 
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
	admin.UserRecordLog ur
INNER JOIN
	admin.Entity e 
ON
	ur.EntityID = e.ID
INNER JOIN
	vwUsers u
ON
	ur.UserID = u.ID


GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUserRecordLog]'
GO


CREATE PROCEDURE [admin].[spUpdateUserRecordLog]
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
        [admin].[UserRecordLog]
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
    SELECT * FROM [admin].[vwUserRecordLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateErrorLog]'
GO


CREATE PROCEDURE [admin].[spUpdateErrorLog]
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
        [admin].[ErrorLog]
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
    SELECT * FROM [admin].[vwErrorLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateCompanyIntegrationRun]'
GO


CREATE PROCEDURE [admin].[spUpdateCompanyIntegrationRun]
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
        [admin].[CompanyIntegrationRun]
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
    SELECT * FROM [admin].[vwCompanyIntegrationRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUserView]'
GO


CREATE PROCEDURE [admin].[spUpdateUserView]
    @ID int,
    @UserID int,
    @EntityID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
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
        [admin].[UserView]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserViews] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteUserView]'
GO


CREATE PROCEDURE [admin].[spDeleteUserView]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[UserView]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwApplications]'
GO


CREATE VIEW [admin].[vwApplications]
AS
SELECT 
    a.*
FROM
    [admin].[Application] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEntityPermissions]'
GO


CREATE VIEW [admin].[vwEntityPermissions]
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
    [admin].[EntityPermission] AS e
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [admin].[Role] AS Role_RoleName
  ON
    [e].[RoleName] = Role_RoleName.[Name]
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsC
  ON
    [e].CreateRLSFilterID = rlsC.ID
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsR
  ON
    [e].ReadRLSFilterID = rlsR.ID
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsU
  ON
    [e].UpdateRLSFilterID = rlsU.ID
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsD
  ON
    [e].DeleteRLSFilterID = rlsD.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateEntityPermission]'
GO


CREATE PROCEDURE [admin].[spCreateEntityPermission]
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
    [admin].[EntityPermission]
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
    SELECT * FROM [admin].[vwEntityPermissions] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserApplications]'
GO


CREATE VIEW [admin].[vwUserApplications]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User],
    Application_ApplicationID.[Name] AS [Application]
FROM
    [admin].[UserApplication] AS u
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
INNER JOIN
    [admin].[Application] AS Application_ApplicationID
  ON
    [u].[ApplicationID] = Application_ApplicationID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanyIntegrations]'
GO

CREATE VIEW [admin].[vwCompanyIntegrations] 
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
  admin.CompanyIntegration ci
INNER JOIN
  admin.Company c ON ci.CompanyName = c.Name
INNER JOIN
  admin.Integration i ON ci.IntegrationName = i.Name
LEFT OUTER JOIN
  admin.CompanyIntegrationRun cir 
ON 
  ci.ID = cir.CompanyIntegrationID AND
  cir.ID = (SELECT TOP 1 cirInner.ID FROM admin.CompanyIntegrationRun cirInner WHERE cirInner.CompanyIntegrationID = ci.ID ORDER BY StartedAt DESC)  
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserApplicationEntities]'
GO

CREATE VIEW [admin].[vwUserApplicationEntities]
AS
SELECT 
   uae.*,
   ua.[Application] Application,
   ua.[User] [User],
   e.Name Entity
FROM
   admin.UserApplicationEntity uae
INNER JOIN
   [admin].vwUserApplications ua
ON
   uae.UserApplicationID = ua.ID
INNER JOIN
   admin.Entity e
ON
   uae.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserApplicationEntity]'
GO


CREATE PROCEDURE [admin].[spCreateUserApplicationEntity]
    @UserApplicationID int,
    @EntityID int,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[UserApplicationEntity]
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
    SELECT * FROM [admin].[vwUserApplicationEntities] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwApplicationEntities]'
GO

CREATE VIEW [admin].[vwApplicationEntities]
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
   admin.ApplicationEntity ae
INNER JOIN
   admin.Application a
ON
   ae.ApplicationName = a.Name
INNER JOIN
   [admin].vwEntities e
ON
   ae.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateApplicationEntity]'
GO


CREATE PROCEDURE [admin].[spCreateApplicationEntity]
    @ApplicationName nvarchar(50),
    @EntityID int,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[ApplicationEntity]
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
    SELECT * FROM [admin].[vwApplicationEntities] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateApplication]'
GO


CREATE PROCEDURE [admin].[spUpdateApplication]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[Application]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwApplications] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUserApplication]'
GO


CREATE PROCEDURE [admin].[spUpdateUserApplication]
    @ID int,
    @UserID int,
    @ApplicationID int,
    @Sequence int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[UserApplication]
    SET 
        [UserID] = @UserID,
        [ApplicationID] = @ApplicationID,
        [Sequence] = @Sequence,
        [IsActive] = @IsActive
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserApplications] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEntityPermission]'
GO


CREATE PROCEDURE [admin].[spUpdateEntityPermission]
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
        [admin].[EntityPermission]
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEntityPermissions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateApplicationEntity]'
GO


CREATE PROCEDURE [admin].[spUpdateApplicationEntity]
    @ID int,
    @ApplicationName nvarchar(50),
    @EntityID int,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[ApplicationEntity]
    SET 
        [ApplicationName] = @ApplicationName,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [DefaultForNewUser] = @DefaultForNewUser,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwApplicationEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwIntegrationURLFormats]'
GO

CREATE VIEW [admin].[vwIntegrationURLFormats]
AS
SELECT 
	iuf.*,
	i.ID IntegrationID,
	i.Name Integration,
	i.NavigationBaseURL,
	i.NavigationBaseURL + iuf.URLFormat FullURLFormat
FROM
	admin.IntegrationURLFormat iuf
INNER JOIN
	admin.Integration i
ON
	iuf.IntegrationName = i.Name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUserApplicationEntity]'
GO


CREATE PROCEDURE [admin].[spUpdateUserApplicationEntity]
    @ID int,
    @UserApplicationID int,
    @EntityID int,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[UserApplicationEntity]
    SET 
        [UserApplicationID] = @UserApplicationID,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserApplicationEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteEntityPermission]'
GO


CREATE PROCEDURE [admin].[spDeleteEntityPermission]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[EntityPermission]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserFavorites]'
GO

CREATE VIEW [admin].[vwUserFavorites]
AS
SELECT 
	uf.*,
	e.Name Entity,
	e.BaseTable EntityBaseTable,
	e.BaseView EntityBaseView
FROM 
	[admin].UserFavorite uf
INNER JOIN
	vwEntities e
ON
	uf.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteApplicationEntity]'
GO


CREATE PROCEDURE [admin].[spDeleteApplicationEntity]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[ApplicationEntity]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteUserApplicationEntity]'
GO


CREATE PROCEDURE [admin].[spDeleteUserApplicationEntity]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[UserApplicationEntity]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserViewRuns]'
GO


CREATE VIEW [admin].[vwUserViewRuns]
AS
SELECT 
    u.*,
    UserView_UserViewID.[Name] AS [UserView],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [admin].[UserViewRun] AS u
INNER JOIN
    [admin].[UserView] AS UserView_UserViewID
  ON
    [u].[UserViewID] = UserView_UserViewID.[ID]
INNER JOIN
    [admin].[User] AS User_RunByUserID
  ON
    [u].[RunByUserID] = User_RunByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanyIntegrationRunAPILogs]'
GO


CREATE VIEW [admin].[vwCompanyIntegrationRunAPILogs]
AS
SELECT 
    c.*
FROM
    [admin].[CompanyIntegrationRunAPILog] AS c
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwLists]'
GO


CREATE VIEW [admin].[vwLists]
AS
SELECT 
    l.*,
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User]
FROM
    [admin].[List] AS l
LEFT OUTER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [l].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [l].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwWorkflows]'
GO


CREATE VIEW [admin].[vwWorkflows]
AS
SELECT 
    w.*
FROM
    [admin].[Workflow] AS w
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwWorkflowRuns]'
GO

CREATE VIEW [admin].[vwWorkflowRuns]
AS
SELECT 
  wr.*,
  w.Name Workflow,
  w.WorkflowEngineName
FROM
  admin.WorkflowRun wr
INNER JOIN
  [admin].vwWorkflows w
ON
  wr.WorkflowName = w.Name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwListDetails]'
GO


CREATE VIEW [admin].[vwListDetails]
AS
SELECT 
    l.*
FROM
    [admin].[ListDetail] AS l
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserViewRunDetails]'
GO

CREATE VIEW [admin].[vwUserViewRunDetails]
AS
SELECT 
    u.*,
	uv.ID UserViewID,
	uv.EntityID
FROM
    [admin].[UserViewRunDetail] AS u
INNER JOIN
	[admin].[UserViewRun] as uvr
  ON
    u.UserViewRunID = uvr.ID
INNER JOIN
    [admin].[UserView] uv
  ON
    uvr.UserViewID = uv.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserViewRunDetail]'
GO


CREATE PROCEDURE [admin].[spCreateUserViewRunDetail]
    @UserViewRunID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[UserViewRunDetail]
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
    SELECT * FROM [admin].[vwUserViewRunDetails] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwRecordChanges]'
GO


CREATE VIEW [admin].[vwRecordChanges]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User]
FROM
    [admin].[RecordChange] AS r
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateRecordChange]'
GO

CREATE PROCEDURE [admin].[spCreateRecordChange]
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
    [admin].[RecordChange]
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
            (SELECT ID FROM admin.Entity WHERE Name = @EntityName),
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
    SELECT * FROM [admin].vwRecordChanges WHERE ID = SCOPE_IDENTITY()
END




GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateCompanyIntegrationRunAPILog]'
GO


CREATE PROCEDURE [admin].[spUpdateCompanyIntegrationRunAPILog]
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
        [admin].[CompanyIntegrationRunAPILog]
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
    SELECT * FROM [admin].[vwCompanyIntegrationRunAPILogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserViewRun]'
GO


CREATE PROCEDURE [admin].[spCreateUserViewRun]
    @UserViewID int,
    @RunAt datetime,
    @RunByUserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[UserViewRun]
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
    SELECT * FROM [admin].[vwUserViewRuns] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateList]'
GO


CREATE PROCEDURE [admin].[spCreateList]
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
    [admin].[List]
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
    SELECT * FROM [admin].[vwLists] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserViewRunWithDetail]'
GO


CREATE PROCEDURE [admin].[spCreateUserViewRunWithDetail](@UserViewID INT, @UserEmail NVARCHAR(255), @RecordIDList admin.IDListTableType READONLY) 
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
INSERT INTO admin.UserViewRunDetail 
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
PRINT N'Creating [admin].[spUpdateUserViewRunDetail]'
GO


CREATE PROCEDURE [admin].[spUpdateUserViewRunDetail]
    @ID int,
    @UserViewRunID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[UserViewRunDetail]
    SET 
        [UserViewRunID] = @UserViewRunID,
        [RecordID] = @RecordID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserViewRunDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateListDetail]'
GO


CREATE PROCEDURE [admin].[spCreateListDetail]
    @ListID int,
    @RecordID nvarchar(255),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[ListDetail]
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
    SELECT * FROM [admin].[vwListDetails] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[SchemaInfo]'
GO
CREATE TABLE [admin].[SchemaInfo]
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
PRINT N'Creating primary key [PK_SchemaInfo] on [admin].[SchemaInfo]'
GO
ALTER TABLE [admin].[SchemaInfo] ADD CONSTRAINT [PK_SchemaInfo] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [admin].[SchemaInfo]'
GO
ALTER TABLE [admin].[SchemaInfo] ADD CONSTRAINT [IX_SchemaInfo] UNIQUE NONCLUSTERED ([SchemaName])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spGetNextEntityID]'
GO

CREATE PROC [admin].[spGetNextEntityID]
    @schemaName NVARCHAR(255)
AS
BEGIN
    DECLARE @EntityIDMin INT;
    DECLARE @EntityIDMax INT;
    DECLARE @MaxEntityID INT;
	DECLARE @NextID INT;

    -- STEP 1: Get EntityIDMin and EntityIDMax from admin.SchemaInfo
    SELECT 
		@EntityIDMin = EntityIDMin, @EntityIDMax = EntityIDMax
    FROM 
		admin.SchemaInfo
    WHERE 
		SchemaName = @schemaName;

    -- STEP 2: If no matching schemaName, insert a new row into admin.SchemaInfo
    IF @EntityIDMin IS NULL OR @EntityIDMax IS NULL
    BEGIN
        -- Get the maximum ID from the admin.Entity table
		DECLARE @MaxEntityIDFromSchema INT;
        SELECT @MaxEntityID = ISNULL(MAX(ID), 0) FROM admin.Entity;
		SELECT @MaxEntityIDFromSchema = ISNULL(MAX(EntityIDMax),0) FROM admin.SchemaInfo;
		IF @MaxEntityIDFromSchema > @MaxEntityID 
			SELECT @MaxEntityID = @MaxEntityIDFromSchema; -- use the max ID From the schema info table if it is higher

        -- Calculate the new EntityIDMin
        SET @EntityIDMin = CASE 
                              WHEN @MaxEntityID >= 25000001 THEN @MaxEntityID + 1
                              ELSE 25000001
                            END;

        -- Calculate the new EntityIDMax
        SET @EntityIDMax = @EntityIDMin + 24999;

        -- Insert the new row into admin.SchemaInfo
        INSERT INTO admin.SchemaInfo (SchemaName, EntityIDMin, EntityIDMax)
        VALUES (@schemaName, @EntityIDMin, @EntityIDMax);
    END

    -- STEP 3: Get the maximum ID currently in the admin.Entity table within the range
    SELECT 
		@NextID = ISNULL(MAX(ID), @EntityIDMin - 1) -- we subtract 1 from entityIDMin as it will be used the first time if Max(EntityID) is null, and below we will increment it by one to be the first ID in that range
    FROM 
		admin.Entity
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
PRINT N'Creating [admin].[spUpdateUserViewRun]'
GO


CREATE PROCEDURE [admin].[spUpdateUserViewRun]
    @ID int,
    @UserViewID int,
    @RunAt datetime,
    @RunByUserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[UserViewRun]
    SET 
        [UserViewID] = @UserViewID,
        [RunAt] = @RunAt,
        [RunByUserID] = @RunByUserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserViewRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwSQLTablesAndEntities]'
GO

CREATE VIEW [admin].[vwSQLTablesAndEntities]
AS
SELECT 
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.*,
	v.object_id view_object_id,
	v.name ViewName
FROM 
	sys.all_objects t
INNER JOIN
	sys.schemas s 
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	admin.Entity e 
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
WHERE   
    (s_v.name = e.SchemaName OR s_v.name IS NULL) AND
	( t.TYPE = 'U' OR (t.Type='V' AND e.VirtualEntity=1)) -- TABLE - non-virtual entities 
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateList]'
GO


CREATE PROCEDURE [admin].[spUpdateList]
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
        [admin].[List]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [EntityID] = @EntityID,
        [UserID] = @UserID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [CompanyIntegrationID] = @CompanyIntegrationID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwLists] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwSQLColumnsAndEntityFields]'
GO

CREATE VIEW [admin].[vwSQLColumnsAndEntityFields]
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
	t.name Type,
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
	cc.definition ComputedColumnDefinition
FROM
	sys.all_columns c
INNER JOIN
	[admin].vwSQLTablesAndEntities e
ON
	c.object_id = IIF(e.view_object_id IS NULL, e.object_id, e.view_object_id)
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
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
	admin.EntityField ef 
ON
	e.EntityID = ef.EntityID AND
	c.name = ef.Name
LEFT OUTER JOIN 
    sys.default_constraints dc 
ON 
    e.object_id = dc.parent_object_id AND
	c.column_id = dc.parent_column_id
WHERE 
	c.default_object_id IS NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateListDetail]'
GO


CREATE PROCEDURE [admin].[spUpdateListDetail]
    @ID int,
    @ListID int,
    @RecordID nvarchar(255),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[ListDetail]
    SET 
        [ListID] = @ListID,
        [RecordID] = @RecordID,
        [Sequence] = @Sequence
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwListDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteUnneededEntityFields]'
GO

CREATE PROC [admin].[spDeleteUnneededEntityFields]
AS
/****************************************************************/
-- Step #3 
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT * INTO #ef_spDeleteUnneededEntityFields FROM vwEntityFields
SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields   

-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE admin.Entity SET UpdatedAt=GETDATE() WHERE ID IN
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
DELETE FROM admin.EntityField WHERE ID IN
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
PRINT N'Creating [admin].[spDeleteList]'
GO


CREATE PROCEDURE [admin].[spDeleteList]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[List]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwTableUniqueKeys]'
GO

CREATE VIEW [admin].[vwTableUniqueKeys] AS
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
PRINT N'Creating [admin].[vwTablePrimaryKeys]'
GO
 
CREATE VIEW [admin].[vwTablePrimaryKeys] AS
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
PRINT N'Creating [admin].[vwForeignKeys]'
GO

CREATE VIEW [admin].[vwForeignKeys]
AS
SELECT  obj.name AS FK_NAME,
    sch.name AS [schema_name],
    tab1.name AS [table],
    col1.name AS [column],
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
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateExistingEntityFieldsFromSchema]'
GO

CREATE PROC [admin].[spUpdateExistingEntityFieldsFromSchema]
AS
BEGIN
    -- Update Statement
    UPDATE [admin].EntityField
    SET
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
        [admin].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
    ON
        ef.EntityID = fromSQL.EntityID AND
        ef.Name = fromSQL.FieldName
    INNER JOIN
        [admin].Entity e 
    ON
        ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
    ON
        ef.Name = fk.[column] AND
        e.BaseTable = fk.[table]
    LEFT OUTER JOIN 
        [admin].Entity re -- Related Entity
    ON
        re.BaseTable = fk.referenced_table
    LEFT OUTER JOIN 
		[admin].vwTablePrimaryKeys pk
    ON
        e.BaseTable = pk.TableName AND
        ef.Name = pk.ColumnName AND
        e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN 
		[admin].vwTableUniqueKeys uk
    ON
        e.BaseTable = uk.TableName AND
        ef.Name = uk.ColumnName AND
        e.SchemaName = uk.SchemaName
	WHERE
		fromSQL.EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteListDetail]'
GO


CREATE PROCEDURE [admin].[spDeleteListDetail]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[ListDetail]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spSetDefaultColumnWidthWhereNeeded]'
GO

CREATE PROC [admin].[spSetDefaultColumnWidthWhereNeeded]
AS
/**************************************************************************************/
/* Final step - generate default column widths for columns that don't have a width set*/
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
	admin.EntityField ef
WHERE
    ef.DefaultColumnWidth IS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserRoles]'
GO


CREATE VIEW [admin].[vwUserRoles]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User]
FROM
    [admin].[UserRole] AS u
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteConversation]'
GO

CREATE PROCEDURE [admin].[spDeleteConversation]
    @ID INT
AS  
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Report - set FK to null before deleting rows in Conversation
    UPDATE 
        [admin].[Report] 
    SET 
        [ConversationID] = NULL 
    WHERE 
        [ConversationID] = @ID

	UPDATE 
        [admin].[Report] 
    SET 
        [ConversationDetailID] = NULL 
    WHERE 
        [ConversationDetailID] IN (SELECT ID FROM admin.ConversationDetail WHERE ConversationID = @ID)

    
    -- Cascade delete from ConversationDetail
    DELETE FROM 
        [admin].[ConversationDetail] 
    WHERE 
        [ConversationID] = @ID
    
    DELETE FROM 
        [admin].[Conversation]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the ID to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateCompanyIntegrationRun]'
GO

CREATE PROC [admin].[spCreateCompanyIntegrationRun]
@CompanyIntegrationID AS INT,
@RunByUserID AS INT,
@StartedAt AS DATETIMEOFFSET(7) = NULL, 
@Comments AS NVARCHAR(MAX) = NULL,
@TotalRecords INT = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO admin.CompanyIntegrationRun
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
PRINT N'Creating [admin].[spCreateCompanyIntegrationRunAPILog]'
GO

CREATE PROC [admin].[spCreateCompanyIntegrationRunAPILog]
(@CompanyIntegrationRunID INT, @RequestMethod NVARCHAR(12), @URL NVARCHAR(MAX), @Parameters NVARCHAR(MAX)=NULL, @IsSuccess BIT)
AS
INSERT INTO [admin].[CompanyIntegrationRunAPILog]
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
PRINT N'Creating [admin].[vwWorkflowEngines]'
GO


CREATE VIEW [admin].[vwWorkflowEngines]
AS
SELECT 
    w.*
FROM
    [admin].[WorkflowEngine] AS w
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateCompanyIntegrationRunDetail]'
GO

CREATE PROC [admin].[spCreateCompanyIntegrationRunDetail]
@CompanyIntegrationRunID AS INT,
@EntityID INT=NULL,
@EntityName NVARCHAR(200)=NULL,
@RecordID INT,
@Action NCHAR(20),
@IsSuccess BIT,
@ExecutedAt DATETIMEOFFSET(7) = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO admin.CompanyIntegrationRunDetail
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
  IIF (@EntityID IS NULL, (SELECT ID FROM admin.Entity WHERE REPLACE(Name,' ', '')=@EntityName), @EntityID),
  @RecordID,
  @Action,
  @IsSuccess,
  IIF (@ExecutedAt IS NULL, GETDATE(), @ExecutedAt)
)

SELECT @NewID = SCOPE_IDENTITY()
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateWorkflowRun]'
GO


CREATE PROCEDURE [admin].[spUpdateWorkflowRun]
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
        [admin].[WorkflowRun]
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
    SELECT * FROM [admin].[vwWorkflowRuns] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateErrorLog]'
GO

CREATE PROC [admin].[spCreateErrorLog]
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


INSERT INTO [admin].[ErrorLog]
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
PRINT N'Creating [admin].[spCreateUserRole]'
GO


CREATE PROCEDURE [admin].[spCreateUserRole]
    @UserID int,
    @RoleName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[UserRole]
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
    SELECT * FROM [admin].[vwUserRoles] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEntityFieldRelatedEntityNameFieldMap]'
GO

CREATE PROC [admin].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
(
	@EntityFieldID INT, 
	@RelatedEntityNameFieldMap NVARCHAR(50)
)
AS
UPDATE 
	admin.EntityField 
SET 
	RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap
WHERE
	ID = @EntityFieldID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateWorkflow]'
GO


CREATE PROCEDURE [admin].[spUpdateWorkflow]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @WorkflowEngineName nvarchar(100),
    @CompanyName nvarchar(50),
    @ExternalSystemRecordID nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[Workflow]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [WorkflowEngineName] = @WorkflowEngineName,
        [CompanyName] = @CompanyName,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwWorkflows] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanyIntegrationRunsRanked]'
GO

CREATE VIEW [admin].[vwCompanyIntegrationRunsRanked] AS
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
	admin.CompanyIntegrationRun ci
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateWorkflowEngine]'
GO


CREATE PROCEDURE [admin].[spUpdateWorkflowEngine]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverPath nvarchar(500),
    @DriverClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[WorkflowEngine]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DriverPath] = @DriverPath,
        [DriverClass] = @DriverClass,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwWorkflowEngines] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spGetAuthenticationDataByExternalSystemID]'
GO

CREATE PROC [admin].[spGetAuthenticationDataByExternalSystemID] 
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
	admin.CompanyIntegration ci
JOIN admin.Integration i
	ON i.Name = ci.IntegrationName
WHERE 
	i.Name = @IntegrationName
	AND ci.ExternalSystemID = @ExternalSystemID
	AND ci.IsActive = 1
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAuthorizations]'
GO


CREATE VIEW [admin].[vwAuthorizations]
AS
SELECT 
    a.*
FROM
    [admin].[Authorization] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAuditLogs]'
GO


CREATE VIEW [admin].[vwAuditLogs]
AS
SELECT 
    a.*,
    User_UserID.[Name] AS [User],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [admin].[AuditLog] AS a
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [a].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwRowLevelSecurityFilters]'
GO


CREATE VIEW [admin].[vwRowLevelSecurityFilters]
AS
SELECT 
    r.*
FROM
    [admin].[RowLevelSecurityFilter] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAuthorizationRoles]'
GO


CREATE VIEW [admin].[vwAuthorizationRoles]
AS
SELECT 
    a.*
FROM
    [admin].[AuthorizationRole] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAuditLogTypes]'
GO


CREATE VIEW [admin].[vwAuditLogTypes]
AS
SELECT 
    a.*,
    AuditLogType_ParentID.[Name] AS [Parent]
FROM
    [admin].[AuditLogType] AS a
LEFT OUTER JOIN
    [admin].[AuditLogType] AS AuditLogType_ParentID
  ON
    [a].[ParentID] = AuditLogType_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateAuditLog]'
GO


CREATE PROCEDURE [admin].[spCreateAuditLog]
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
    [admin].[AuditLog]
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
    SELECT * FROM [admin].[vwAuditLogs] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateAuditLog]'
GO


CREATE PROCEDURE [admin].[spUpdateAuditLog]
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
        [admin].[AuditLog]
    SET 
        [AuditLogTypeName] = @AuditLogTypeName,
        [UserID] = @UserID,
        [AuthorizationName] = @AuthorizationName,
        [Status] = @Status,
        [Description] = @Description,
        [Details] = @Details,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwAuditLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAIModelActions]'
GO


CREATE VIEW [admin].[vwAIModelActions]
AS
SELECT 
    a.*,
    AIModel_AIModelID.[Name] AS [AIModel],
    AIAction_AIActionID.[Name] AS [AIAction]
FROM
    [admin].[AIModelAction] AS a
INNER JOIN
    [admin].[AIModel] AS AIModel_AIModelID
  ON
    [a].[AIModelID] = AIModel_AIModelID.[ID]
INNER JOIN
    [admin].[AIAction] AS AIAction_AIActionID
  ON
    [a].[AIActionID] = AIAction_AIActionID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEntityFieldValues]'
GO


CREATE VIEW [admin].[vwEntityFieldValues]
AS
SELECT 
    e.*,
    EntityField_EntityID.[Name] AS [Entity]
FROM
    [admin].[EntityFieldValue] AS e
INNER JOIN
    [admin].[EntityField] AS EntityField_EntityID
  ON
    [e].[EntityID] = EntityField_EntityID.[EntityID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEntityAIActions]'
GO


CREATE VIEW [admin].[vwEntityAIActions]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    AIAction_AIActionID.[Name] AS [AIAction],
    AIModel_AIModelID.[Name] AS [AIModel],
    Entity_OutputEntityID.[Name] AS [OutputEntity]
FROM
    [admin].[EntityAIAction] AS e
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [admin].[AIAction] AS AIAction_AIActionID
  ON
    [e].[AIActionID] = AIAction_AIActionID.[ID]
LEFT OUTER JOIN
    [admin].[AIModel] AS AIModel_AIModelID
  ON
    [e].[AIModelID] = AIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [admin].[Entity] AS Entity_OutputEntityID
  ON
    [e].[OutputEntityID] = Entity_OutputEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAIActions]'
GO


CREATE VIEW [admin].[vwAIActions]
AS
SELECT 
    a.*,
    AIModel_DefaultModelID.[Name] AS [DefaultModel]
FROM
    [admin].[AIAction] AS a
LEFT OUTER JOIN
    [admin].[AIModel] AS AIModel_DefaultModelID
  ON
    [a].[DefaultModelID] = AIModel_DefaultModelID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAIModels]'
GO


CREATE VIEW [admin].[vwAIModels]
AS
SELECT 
    a.*
FROM
    [admin].[AIModel] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateAIModelAction]'
GO


CREATE PROCEDURE [admin].[spUpdateAIModelAction]
    @ID int,
    @AIModelID int,
    @AIActionID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[AIModelAction]
    SET 
        [AIModelID] = @AIModelID,
        [AIActionID] = @AIActionID,
        [IsActive] = @IsActive,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwAIModelActions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEntityAIAction]'
GO


CREATE PROCEDURE [admin].[spUpdateEntityAIAction]
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
        [admin].[EntityAIAction]
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
    SELECT * FROM [admin].[vwEntityAIActions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateAIAction]'
GO


CREATE PROCEDURE [admin].[spUpdateAIAction]
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
        [admin].[AIAction]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DefaultModelID] = @DefaultModelID,
        [DefaultPrompt] = @DefaultPrompt,
        [IsActive] = @IsActive,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwAIActions] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateAIModel]'
GO


CREATE PROCEDURE [admin].[spUpdateAIModel]
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
        [admin].[AIModel]
    SET 
        [Name] = @Name,
        [Vendor] = @Vendor,
        [AIModelTypeID] = @AIModelTypeID,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [IsActive] = @IsActive,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwAIModels] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwQueueTypes]'
GO


CREATE VIEW [admin].[vwQueueTypes]
AS
SELECT 
    q.*
FROM
    [admin].[QueueType] AS q
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwAIModelTypes]'
GO


CREATE VIEW [admin].[vwAIModelTypes]
AS
SELECT 
    a.*
FROM
    [admin].[AIModelType] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwQueues]'
GO


CREATE VIEW [admin].[vwQueues]
AS
SELECT 
    q.*,
    QueueType_QueueTypeID.[Name] AS [QueueType]
FROM
    [admin].[Queue] AS q
INNER JOIN
    [admin].[QueueType] AS QueueType_QueueTypeID
  ON
    [q].[QueueTypeID] = QueueType_QueueTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwDashboards]'
GO


CREATE VIEW [admin].[vwDashboards]
AS
SELECT 
    d.*,
    User_UserID.[Name] AS [User]
FROM
    [admin].[Dashboard] AS d
LEFT OUTER JOIN
    [admin].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwQueueTasks]'
GO


CREATE VIEW [admin].[vwQueueTasks]
AS
SELECT 
    q.*
FROM
    [admin].[QueueTask] AS q
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateAIModelType]'
GO


CREATE PROCEDURE [admin].[spUpdateAIModelType]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[AIModelType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwAIModelTypes] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateQueue]'
GO


CREATE PROCEDURE [admin].[spCreateQueue]
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
    [admin].[Queue]
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
    SELECT * FROM [admin].[vwQueues] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateDashboard]'
GO


CREATE PROCEDURE [admin].[spCreateDashboard]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UIConfigDetails nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[Dashboard]
        (
            [Name],
            [Description],
            [UIConfigDetails],
            [UserID]
        )
    VALUES
        (
            @Name,
            @Description,
            @UIConfigDetails,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [admin].[vwDashboards] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateQueueTask]'
GO


CREATE PROCEDURE [admin].[spCreateQueueTask]
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
    [admin].[QueueTask]
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
    SELECT * FROM [admin].[vwQueueTasks] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateQueue]'
GO


CREATE PROCEDURE [admin].[spUpdateQueue]
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
        [admin].[Queue]
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwQueues] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateDashboard]'
GO


CREATE PROCEDURE [admin].[spUpdateDashboard]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UIConfigDetails nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[Dashboard]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UIConfigDetails] = @UIConfigDetails,
        [UserID] = @UserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwDashboards] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateQueueTask]'
GO


CREATE PROCEDURE [admin].[spUpdateQueueTask]
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
        [admin].[QueueTask]
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
    SELECT * FROM [admin].[vwQueueTasks] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteDashboard]'
GO


CREATE PROCEDURE [admin].[spDeleteDashboard]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[Dashboard]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwOutputFormatTypes]'
GO


CREATE VIEW [admin].[vwOutputFormatTypes]
AS
SELECT 
    o.*
FROM
    [admin].[OutputFormatType] AS o
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwOutputTriggerTypes]'
GO


CREATE VIEW [admin].[vwOutputTriggerTypes]
AS
SELECT 
    o.*
FROM
    [admin].[OutputTriggerType] AS o
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwReports]'
GO


CREATE VIEW [admin].[vwReports]
AS
SELECT 
    r.*,
    User_UserID.[Name] AS [User],
    Conversation_ConversationID.[Name] AS [Conversation],
    OutputTriggerType_OutputTriggerTypeID.[Name] AS [OutputTriggerType],
    OutputFormatType_OutputFormatTypeID.[Name] AS [OutputFormatType],
    OutputDeliveryType_OutputDeliveryTypeID.[Name] AS [OutputDeliveryType],
    OutputDeliveryType_OutputEventID.[Name] AS [OutputEvent]
FROM
    [admin].[Report] AS r
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [admin].[Conversation] AS Conversation_ConversationID
  ON
    [r].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [admin].[OutputTriggerType] AS OutputTriggerType_OutputTriggerTypeID
  ON
    [r].[OutputTriggerTypeID] = OutputTriggerType_OutputTriggerTypeID.[ID]
LEFT OUTER JOIN
    [admin].[OutputFormatType] AS OutputFormatType_OutputFormatTypeID
  ON
    [r].[OutputFormatTypeID] = OutputFormatType_OutputFormatTypeID.[ID]
LEFT OUTER JOIN
    [admin].[OutputDeliveryType] AS OutputDeliveryType_OutputDeliveryTypeID
  ON
    [r].[OutputDeliveryTypeID] = OutputDeliveryType_OutputDeliveryTypeID.[ID]
LEFT OUTER JOIN
    [admin].[OutputDeliveryType] AS OutputDeliveryType_OutputEventID
  ON
    [r].[OutputEventID] = OutputDeliveryType_OutputEventID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwReportSnapshots]'
GO


CREATE VIEW [admin].[vwReportSnapshots]
AS
SELECT 
    r.*,
    Report_ReportID.[Name] AS [Report],
    User_UserID.[Name] AS [User]
FROM
    [admin].[ReportSnapshot] AS r
INNER JOIN
    [admin].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
LEFT OUTER JOIN
    [admin].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwOutputDeliveryTypes]'
GO


CREATE VIEW [admin].[vwOutputDeliveryTypes]
AS
SELECT 
    o.*
FROM
    [admin].[OutputDeliveryType] AS o
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateReport]'
GO


CREATE PROCEDURE [admin].[spCreateReport]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int,
    @SharingScope nvarchar(20),
    @ConversationID int,
    @ConversationDetailID int,
    @ReportSQL nvarchar(MAX),
    @ReportConfiguration nvarchar(MAX),
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
    [admin].[Report]
        (
            [Name],
            [Description],
            [UserID],
            [SharingScope],
            [ConversationID],
            [ConversationDetailID],
            [ReportSQL],
            [ReportConfiguration],
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
            @UserID,
            @SharingScope,
            @ConversationID,
            @ConversationDetailID,
            @ReportSQL,
            @ReportConfiguration,
            @OutputTriggerTypeID,
            @OutputFormatTypeID,
            @OutputDeliveryTypeID,
            @OutputEventID,
            @OutputFrequency,
            @OutputTargetEmail,
            @OutputWorkflowID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [admin].[vwReports] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateReportSnapshot]'
GO


CREATE PROCEDURE [admin].[spCreateReportSnapshot]
    @ReportID int,
    @ResultSet nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[ReportSnapshot]
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
    SELECT * FROM [admin].[vwReportSnapshots] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateReport]'
GO


CREATE PROCEDURE [admin].[spUpdateReport]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int,
    @SharingScope nvarchar(20),
    @ConversationID int,
    @ConversationDetailID int,
    @ReportSQL nvarchar(MAX),
    @ReportConfiguration nvarchar(MAX),
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
        [admin].[Report]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [ReportSQL] = @ReportSQL,
        [ReportConfiguration] = @ReportConfiguration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputEventID] = @OutputEventID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwReports] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateReportSnapshot]'
GO


CREATE PROCEDURE [admin].[spUpdateReportSnapshot]
    @ID int,
    @ReportID int,
    @ResultSet nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[ReportSnapshot]
    SET 
        [ReportID] = @ReportID,
        [ResultSet] = @ResultSet,
        [UserID] = @UserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwReportSnapshots] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteReport]'
GO


CREATE PROCEDURE [admin].[spDeleteReport]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[Report]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteReportSnapshot]'
GO


CREATE PROCEDURE [admin].[spDeleteReportSnapshot]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[ReportSnapshot]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwWorkspaces]'
GO


CREATE VIEW [admin].[vwWorkspaces]
AS
SELECT 
    w.*,
    User_UserID.[Name] AS [User]
FROM
    [admin].[Workspace] AS w
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [w].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwTaggedItems]'
GO


CREATE VIEW [admin].[vwTaggedItems]
AS
SELECT 
    t.*,
    Tag_TagID.[Name] AS [Tag],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [admin].[TaggedItem] AS t
INNER JOIN
    [admin].[Tag] AS Tag_TagID
  ON
    [t].[TagID] = Tag_TagID.[ID]
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [t].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwTags]'
GO


CREATE VIEW [admin].[vwTags]
AS
SELECT 
    t.*,
    Tag_ParentID.[Name] AS [Parent]
FROM
    [admin].[Tag] AS t
LEFT OUTER JOIN
    [admin].[Tag] AS Tag_ParentID
  ON
    [t].[ParentID] = Tag_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwWorkspaceItems]'
GO


CREATE VIEW [admin].[vwWorkspaceItems]
AS
SELECT 
    w.*,
    Workspace_WorkSpaceID.[Name] AS [WorkSpace],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [admin].[WorkspaceItem] AS w
INNER JOIN
    [admin].[Workspace] AS Workspace_WorkSpaceID
  ON
    [w].[WorkSpaceID] = Workspace_WorkSpaceID.[ID]
INNER JOIN
    [admin].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [w].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwResourceTypes]'
GO


CREATE VIEW [admin].[vwResourceTypes]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [admin].[ResourceType] AS r
LEFT OUTER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateWorkspace]'
GO


CREATE PROCEDURE [admin].[spCreateWorkspace]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[Workspace]
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
    SELECT * FROM [admin].[vwWorkspaces] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateWorkspaceItem]'
GO


CREATE PROCEDURE [admin].[spCreateWorkspaceItem]
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
    [admin].[WorkspaceItem]
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
    SELECT * FROM [admin].[vwWorkspaceItems] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateWorkspace]'
GO


CREATE PROCEDURE [admin].[spUpdateWorkspace]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[Workspace]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwWorkspaces] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateWorkspaceItem]'
GO


CREATE PROCEDURE [admin].[spUpdateWorkspaceItem]
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
        [admin].[WorkspaceItem]
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
    SELECT * FROM [admin].[vwWorkspaceItems] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteWorkspace]'
GO


CREATE PROCEDURE [admin].[spDeleteWorkspace]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[Workspace]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteWorkspaceItem]'
GO


CREATE PROCEDURE [admin].[spDeleteWorkspaceItem]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[WorkspaceItem]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwConversationDetails]'
GO


CREATE VIEW [admin].[vwConversationDetails]
AS
SELECT 
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation]
FROM
    [admin].[ConversationDetail] AS c
INNER JOIN
    [admin].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwDatasets]'
GO


CREATE VIEW [admin].[vwDatasets]
AS
SELECT 
    d.*
FROM
    [admin].[Dataset] AS d
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwConversations]'
GO


CREATE VIEW [admin].[vwConversations]
AS
SELECT 
    c.*,
    User_UserID.[Name] AS [User]
FROM
    [admin].[Conversation] AS c
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwUserNotifications]'
GO


CREATE VIEW [admin].[vwUserNotifications]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User]
FROM
    [admin].[UserNotification] AS u
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwDatasetItems]'
GO


CREATE VIEW [admin].[vwDatasetItems]
AS
SELECT 
    d.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [admin].[DatasetItem] AS d
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanies]'
GO


CREATE VIEW [admin].[vwCompanies]
AS
SELECT 
    c.*
FROM
    [admin].[Company] AS c
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateConversationDetail]'
GO


CREATE PROCEDURE [admin].[spCreateConversationDetail]
    @ConversationID int,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[ConversationDetail]
        (
            [ConversationID],
            [ExternalID],
            [Role],
            [Message],
            [Error]
        )
    VALUES
        (
            @ConversationID,
            @ExternalID,
            @Role,
            @Message,
            @Error
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [admin].[vwConversationDetails] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateEmployee]'
GO


CREATE PROCEDURE [admin].[spCreateEmployee]
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
    [admin].[Employee]
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
    SELECT * FROM [admin].[vwEmployees] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserNotification]'
GO


CREATE PROCEDURE [admin].[spCreateUserNotification]
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
    [admin].[UserNotification]
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
    SELECT * FROM [admin].[vwUserNotifications] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEmployeeCompanyIntegrations]'
GO


CREATE VIEW [admin].[vwEmployeeCompanyIntegrations]
AS
SELECT 
    e.*
FROM
    [admin].[EmployeeCompanyIntegration] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateConversation]'
GO


CREATE PROCEDURE [admin].[spCreateConversation]
    @UserID int,
    @ExternalID nvarchar(100),
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[Conversation]
        (
            [UserID],
            [ExternalID],
            [Name]
        )
    VALUES
        (
            @UserID,
            @ExternalID,
            @Name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [admin].[vwConversations] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUserFavorite]'
GO


CREATE PROCEDURE [admin].[spCreateUserFavorite]
    @UserID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[UserFavorite]
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
    SELECT * FROM [admin].[vwUserFavorites] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateConversationDetail]'
GO


CREATE PROCEDURE [admin].[spUpdateConversationDetail]
    @ID int,
    @ConversationID int,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[ConversationDetail]
    SET 
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwConversationDetails] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEmployeeRoles]'
GO


CREATE VIEW [admin].[vwEmployeeRoles]
AS
SELECT 
    e.*,
    Role_RoleID.[Name] AS [Role]
FROM
    [admin].[EmployeeRole] AS e
INNER JOIN
    [admin].[Role] AS Role_RoleID
  ON
    [e].[RoleID] = Role_RoleID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUserNotification]'
GO


CREATE PROCEDURE [admin].[spUpdateUserNotification]
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
        [admin].[UserNotification]
    SET 
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserNotifications] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateCompany]'
GO


CREATE PROCEDURE [admin].[spCreateCompany]
    @Name nvarchar(50),
    @Description nvarchar(200),
    @Website nvarchar(100),
    @LogoURL nvarchar(500),
    @Domain nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[Company]
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
    SELECT * FROM [admin].[vwCompanies] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateConversation]'
GO


CREATE PROCEDURE [admin].[spUpdateConversation]
    @ID int,
    @UserID int,
    @ExternalID nvarchar(100),
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[Conversation]
    SET 
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwConversations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEmployeeCompanyIntegration]'
GO


CREATE PROCEDURE [admin].[spUpdateEmployeeCompanyIntegration]
    @ID int,
    @EmployeeID int,
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[EmployeeCompanyIntegration]
    SET 
        [EmployeeID] = @EmployeeID,
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [IsActive] = @IsActive,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEmployeeCompanyIntegrations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteConversationDetail]'
GO


CREATE PROCEDURE [admin].[spDeleteConversationDetail]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[ConversationDetail]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateUserFavorite]'
GO


CREATE PROCEDURE [admin].[spUpdateUserFavorite]
    @ID int,
    @UserID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[UserFavorite]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwUserFavorites] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwCompanyIntegrationRecordMaps]'
GO


CREATE VIEW [admin].[vwCompanyIntegrationRecordMaps]
AS
SELECT 
    c.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [admin].[CompanyIntegrationRecordMap] AS c
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [c].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEmployee]'
GO


CREATE PROCEDURE [admin].[spUpdateEmployee]
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
        [admin].[Employee]
    SET 
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Phone] = @Phone,
        [Active] = @Active,
        [CompanyID] = @CompanyID,
        [SupervisorID] = @SupervisorID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEmployees] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwRecordMergeDeletionLogs]'
GO


CREATE VIEW [admin].[vwRecordMergeDeletionLogs]
AS
SELECT 
    r.*
FROM
    [admin].[RecordMergeDeletionLog] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEmployeeRole]'
GO


CREATE PROCEDURE [admin].[spUpdateEmployeeRole]
    @ID int,
    @EmployeeID int,
    @RoleID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[EmployeeRole]
    SET 
        [EmployeeID] = @EmployeeID,
        [RoleID] = @RoleID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEmployeeRoles] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwResourceFolders]'
GO


CREATE VIEW [admin].[vwResourceFolders]
AS
SELECT 
    r.*,
    ResourceFolder_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [admin].[ResourceFolder] AS r
LEFT OUTER JOIN
    [admin].[ResourceFolder] AS ResourceFolder_ParentID
  ON
    [r].[ParentID] = ResourceFolder_ParentID.[ID]
INNER JOIN
    [admin].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateCompany]'
GO


CREATE PROCEDURE [admin].[spUpdateCompany]
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
        [admin].[Company]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Website] = @Website,
        [LogoURL] = @LogoURL,
        UpdatedAt = GETDATE(),
        [Domain] = @Domain
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwCompanies] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwSchemaInfos]'
GO


CREATE VIEW [admin].[vwSchemaInfos]
AS
SELECT 
    s.*
FROM
    [admin].[SchemaInfo] AS s
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteUserFavorite]'
GO


CREATE PROCEDURE [admin].[spDeleteUserFavorite]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[UserFavorite]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwRecordMergeLogs]'
GO


CREATE VIEW [admin].[vwRecordMergeLogs]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_InitiatedByUserID.[Name] AS [InitiatedByUser]
FROM
    [admin].[RecordMergeLog] AS r
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [admin].[User] AS User_InitiatedByUserID
  ON
    [r].[InitiatedByUserID] = User_InitiatedByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteEmployee]'
GO


CREATE PROCEDURE [admin].[spDeleteEmployee]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[Employee]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateRecordMergeDeletionLog]'
GO


CREATE PROCEDURE [admin].[spCreateRecordMergeDeletionLog]
    @RecordMergeLogID int,
    @DeletedRecordID nvarchar(255),
    @Status nvarchar(10),
    @ProcessingLog nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[RecordMergeDeletionLog]
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
    SELECT * FROM [admin].[vwRecordMergeDeletionLogs] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spDeleteCompany]'
GO


CREATE PROCEDURE [admin].[spDeleteCompany]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;
    DELETE FROM 
        [admin].[Company]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the primary key value to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateCompanyIntegrationRecordMap]'
GO


CREATE PROCEDURE [admin].[spCreateCompanyIntegrationRecordMap]
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @EntityID int,
    @EntityRecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[CompanyIntegrationRecordMap]
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
    SELECT * FROM [admin].[vwCompanyIntegrationRecordMaps] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwEmployeeSkills]'
GO


CREATE VIEW [admin].[vwEmployeeSkills]
AS
SELECT 
    e.*,
    Skill_SkillID.[Name] AS [Skill]
FROM
    [admin].[EmployeeSkill] AS e
INNER JOIN
    [admin].[Skill] AS Skill_SkillID
  ON
    [e].[SkillID] = Skill_SkillID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateResourceFolder]'
GO


CREATE PROCEDURE [admin].[spCreateResourceFolder]
    @ParentID int,
    @Name nvarchar(50),
    @ResourceTypeName nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[ResourceFolder]
        (
            [ParentID],
            [Name],
            [ResourceTypeName],
            [Description],
            [UserID]
        )
    VALUES
        (
            @ParentID,
            @Name,
            @ResourceTypeName,
            @Description,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [admin].[vwResourceFolders] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwSkills]'
GO


CREATE VIEW [admin].[vwSkills]
AS
SELECT 
    s.*,
    Skill_ParentID.[Name] AS [Parent]
FROM
    [admin].[Skill] AS s
LEFT OUTER JOIN
    [admin].[Skill] AS Skill_ParentID
  ON
    [s].[ParentID] = Skill_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateSchemaInfo]'
GO


CREATE PROCEDURE [admin].[spCreateSchemaInfo]
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [admin].[SchemaInfo]
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
    SELECT * FROM [admin].[vwSchemaInfos] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwIntegrations]'
GO


CREATE VIEW [admin].[vwIntegrations]
AS
SELECT 
    i.*
FROM
    [admin].[Integration] AS i
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateRecordMergeLog]'
GO


CREATE PROCEDURE [admin].[spCreateRecordMergeLog]
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
    [admin].[RecordMergeLog]
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
    SELECT * FROM [admin].[vwRecordMergeLogs] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[vwRoles]'
GO


CREATE VIEW [admin].[vwRoles]
AS
SELECT 
    r.*
FROM
    [admin].[Role] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateRecordMergeDeletionLog]'
GO


CREATE PROCEDURE [admin].[spUpdateRecordMergeDeletionLog]
    @ID int,
    @RecordMergeLogID int,
    @DeletedRecordID nvarchar(255),
    @Status nvarchar(10),
    @ProcessingLog nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[RecordMergeDeletionLog]
    SET 
        [RecordMergeLogID] = @RecordMergeLogID,
        [DeletedRecordID] = @DeletedRecordID,
        [Status] = @Status,
        [ProcessingLog] = @ProcessingLog,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwRecordMergeDeletionLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateIntegrationURLFormat]'
GO


CREATE PROCEDURE [admin].[spUpdateIntegrationURLFormat]
    @ID int,
    @IntegrationName nvarchar(100),
    @EntityID int,
    @URLFormat nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[IntegrationURLFormat]
    SET 
        [IntegrationName] = @IntegrationName,
        [EntityID] = @EntityID,
        [URLFormat] = @URLFormat
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwIntegrationURLFormats] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateCompanyIntegrationRecordMap]'
GO


CREATE PROCEDURE [admin].[spUpdateCompanyIntegrationRecordMap]
    @ID int,
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @EntityID int,
    @EntityRecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[CompanyIntegrationRecordMap]
    SET 
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [EntityID] = @EntityID,
        [EntityRecordID] = @EntityRecordID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwCompanyIntegrationRecordMaps] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateEmployeeSkill]'
GO


CREATE PROCEDURE [admin].[spUpdateEmployeeSkill]
    @ID int,
    @EmployeeID int,
    @SkillID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[EmployeeSkill]
    SET 
        [EmployeeID] = @EmployeeID,
        [SkillID] = @SkillID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwEmployeeSkills] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateResourceFolder]'
GO


CREATE PROCEDURE [admin].[spUpdateResourceFolder]
    @ID int,
    @ParentID int,
    @Name nvarchar(50),
    @ResourceTypeName nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[ResourceFolder]
    SET 
        [ParentID] = @ParentID,
        [Name] = @Name,
        [ResourceTypeName] = @ResourceTypeName,
        [Description] = @Description,
        [UserID] = @UserID,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwResourceFolders] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateIntegration]'
GO


CREATE PROCEDURE [admin].[spUpdateIntegration]
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
        [admin].[Integration]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [NavigationBaseURL] = @NavigationBaseURL,
        [ClassName] = @ClassName,
        [ImportPath] = @ImportPath,
        [BatchMaxRequestCount] = @BatchMaxRequestCount,
        [BatchRequestWaitTime] = @BatchRequestWaitTime,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwIntegrations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateRecordMergeLog]'
GO


CREATE PROCEDURE [admin].[spUpdateRecordMergeLog]
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
        [admin].[RecordMergeLog]
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
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwRecordMergeLogs] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateRole]'
GO


CREATE PROCEDURE [admin].[spUpdateRole]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(500),
    @AzureID nvarchar(50),
    @SQLName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[Role]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [AzureID] = @AzureID,
        [SQLName] = @SQLName,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwRoles] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateSchemaInfo]'
GO


CREATE PROCEDURE [admin].[spUpdateSchemaInfo]
    @ID int,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [admin].[SchemaInfo]
    SET 
        [SchemaName] = @SchemaName,
        [EntityIDMin] = @EntityIDMin,
        [EntityIDMax] = @EntityIDMax,
        [Comments] = @Comments,
        UpdatedAt = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwSchemaInfos] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spUpdateCompanyIntegration]'
GO


CREATE PROCEDURE [admin].[spUpdateCompanyIntegration]
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
        [admin].[CompanyIntegration]
    SET 
        [CompanyName] = @CompanyName,
        [IntegrationName] = @IntegrationName,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        UpdatedAt = GETDATE(),
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [admin].[vwCompanyIntegrations] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateUser]'
GO


CREATE PROCEDURE [admin].[spCreateUser]
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
    [admin].[User]
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
    SELECT * FROM [admin].[vwUsers] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[spCreateEntityRelationship]'
GO


CREATE PROCEDURE [admin].[spCreateEntityRelationship]
    @EntityID int,
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
    [admin].[EntityRelationship]
        (
            [EntityID],
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
    SELECT * FROM [admin].[vwEntityRelationships] WHERE ID = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [admin].[ToProperCase]'
GO


CREATE FUNCTION [admin].[ToProperCase](@string VARCHAR(255)) RETURNS VARCHAR(255)
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
PRINT N'Creating [admin].[ToTitleCase]'
GO

CREATE FUNCTION [admin].[ToTitleCase] (@InputString varchar(4000))
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
PRINT N'Creating [admin].[fnInitials]'
GO


CREATE FUNCTION [admin].[fnInitials] 
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
PRINT N'Creating [admin].[parseDomainFromEmail]'
GO

CREATE FUNCTION [admin].[parseDomainFromEmail](@Email NVARCHAR(320))
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
PRINT N'Creating [admin].[parseDomain]'
GO

CREATE FUNCTION [admin].[parseDomain](
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
PRINT N'Creating [admin].[spGetPrimaryKeyForTable]'
GO

CREATE PROC [admin].[spGetPrimaryKeyForTable] 
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
PRINT N'Adding foreign keys to [admin].[AIAction]'
GO
ALTER TABLE [admin].[AIAction] ADD CONSTRAINT [FK_AIAction_AIModel] FOREIGN KEY ([DefaultModelID]) REFERENCES [admin].[AIModel] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[AIModelAction]'
GO
ALTER TABLE [admin].[AIModelAction] ADD CONSTRAINT [FK_AIModelAction_AIAction] FOREIGN KEY ([AIActionID]) REFERENCES [admin].[AIAction] ([ID])
GO
ALTER TABLE [admin].[AIModelAction] ADD CONSTRAINT [FK_AIModelAction_AIModel] FOREIGN KEY ([AIModelID]) REFERENCES [admin].[AIModel] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[AIModel]'
GO
ALTER TABLE [admin].[AIModel] ADD CONSTRAINT [FK_AIModel_AIModelType] FOREIGN KEY ([AIModelTypeID]) REFERENCES [admin].[AIModelType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ApplicationEntity]'
GO
ALTER TABLE [admin].[ApplicationEntity] ADD CONSTRAINT [FK_ApplicationEntity_ApplicationName] FOREIGN KEY ([ApplicationName]) REFERENCES [admin].[Application] ([Name])
GO
ALTER TABLE [admin].[ApplicationEntity] ADD CONSTRAINT [FK_ApplicationEntity_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[AuditLogType]'
GO
ALTER TABLE [admin].[AuditLogType] ADD CONSTRAINT [FK_AuditLogType_Authorization] FOREIGN KEY ([AuthorizationName]) REFERENCES [admin].[Authorization] ([Name])
GO
ALTER TABLE [admin].[AuditLogType] ADD CONSTRAINT [FK_AuditLogType_ParentID] FOREIGN KEY ([ParentID]) REFERENCES [admin].[AuditLogType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[AuditLog]'
GO
ALTER TABLE [admin].[AuditLog] ADD CONSTRAINT [FK_AuditLog_AuditLogType] FOREIGN KEY ([AuditLogTypeName]) REFERENCES [admin].[AuditLogType] ([Name])
GO
ALTER TABLE [admin].[AuditLog] ADD CONSTRAINT [FK_AuditLog_Authorization] FOREIGN KEY ([AuthorizationName]) REFERENCES [admin].[Authorization] ([Name])
GO
ALTER TABLE [admin].[AuditLog] ADD CONSTRAINT [FK_AuditLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[AuditLog] ADD CONSTRAINT [FK_AuditLog_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[AuthorizationRole]'
GO
ALTER TABLE [admin].[AuthorizationRole] ADD CONSTRAINT [FK_AuthorizationRole_Authorization1] FOREIGN KEY ([AuthorizationName]) REFERENCES [admin].[Authorization] ([Name])
GO
ALTER TABLE [admin].[AuthorizationRole] ADD CONSTRAINT [FK_AuthorizationRole_Role1] FOREIGN KEY ([RoleName]) REFERENCES [admin].[Role] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Authorization]'
GO
ALTER TABLE [admin].[Authorization] ADD CONSTRAINT [FK_Authorization_Parent] FOREIGN KEY ([ParentID]) REFERENCES [admin].[Authorization] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [admin].[CompanyIntegrationRecordMap] ADD CONSTRAINT [FK_CompanyIntegrationRecordMap_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [admin].[CompanyIntegration] ([ID])
GO
ALTER TABLE [admin].[CompanyIntegrationRecordMap] ADD CONSTRAINT [FK_CompanyIntegrationRecordMap_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[CompanyIntegrationRunAPILog]'
GO
ALTER TABLE [admin].[CompanyIntegrationRunAPILog] ADD CONSTRAINT [FK_CompanyIntegrationRunAPILog_CompanyIntegrationRun] FOREIGN KEY ([CompanyIntegrationRunID]) REFERENCES [admin].[CompanyIntegrationRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[CompanyIntegrationRunDetail]'
GO
ALTER TABLE [admin].[CompanyIntegrationRunDetail] ADD CONSTRAINT [FK_CompanyIntegrationRunDetail_CompanyIntegrationRun] FOREIGN KEY ([CompanyIntegrationRunID]) REFERENCES [admin].[CompanyIntegrationRun] ([ID])
GO
ALTER TABLE [admin].[CompanyIntegrationRunDetail] ADD CONSTRAINT [FK_CompanyIntegrationRunDetail_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[CompanyIntegrationRun]'
GO
ALTER TABLE [admin].[CompanyIntegrationRun] ADD CONSTRAINT [FK_CompanyIntegrationRun_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [admin].[CompanyIntegration] ([ID])
GO
ALTER TABLE [admin].[CompanyIntegrationRun] ADD CONSTRAINT [FK_CompanyIntegrationRun_User] FOREIGN KEY ([RunByUserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[CompanyIntegration]'
GO
ALTER TABLE [admin].[CompanyIntegration] ADD CONSTRAINT [FK_CompanyIntegration_Company] FOREIGN KEY ([CompanyName]) REFERENCES [admin].[Company] ([Name])
GO
ALTER TABLE [admin].[CompanyIntegration] ADD CONSTRAINT [FK_CompanyIntegration_Integration] FOREIGN KEY ([IntegrationName]) REFERENCES [admin].[Integration] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ConversationDetail]'
GO
ALTER TABLE [admin].[ConversationDetail] ADD CONSTRAINT [FK__Conversat__Conve__051D25D5] FOREIGN KEY ([ConversationID]) REFERENCES [admin].[Conversation] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Conversation]'
GO
ALTER TABLE [admin].[Conversation] ADD CONSTRAINT [FK__Conversat__UserI__0429019C] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Dashboard]'
GO
ALTER TABLE [admin].[Dashboard] ADD CONSTRAINT [FK__Dashboard__UserI__343EFBB6] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[DatasetItem]'
GO
ALTER TABLE [admin].[DatasetItem] ADD CONSTRAINT [FK_DatasetItem_DatasetName] FOREIGN KEY ([DatasetName]) REFERENCES [admin].[Dataset] ([Name])
GO
ALTER TABLE [admin].[DatasetItem] ADD CONSTRAINT [FK_DatasetItem_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [admin].[EmployeeCompanyIntegration] ADD CONSTRAINT [FK_EmployeeCompanyIntegration_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [admin].[CompanyIntegration] ([ID])
GO
ALTER TABLE [admin].[EmployeeCompanyIntegration] ADD CONSTRAINT [FK_EmployeeCompanyIntegration_Employee] FOREIGN KEY ([EmployeeID]) REFERENCES [admin].[Employee] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EmployeeRole]'
GO
ALTER TABLE [admin].[EmployeeRole] ADD CONSTRAINT [FK__EmployeeR__Emplo__73852659] FOREIGN KEY ([EmployeeID]) REFERENCES [admin].[Employee] ([ID]) ON DELETE CASCADE
GO
ALTER TABLE [admin].[EmployeeRole] ADD CONSTRAINT [FK__EmployeeR__RoleI__74794A92] FOREIGN KEY ([RoleID]) REFERENCES [admin].[Role] ([ID]) ON DELETE CASCADE
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EmployeeSkill]'
GO
ALTER TABLE [admin].[EmployeeSkill] ADD CONSTRAINT [FK__EmployeeS__Emplo__756D6ECB] FOREIGN KEY ([EmployeeID]) REFERENCES [admin].[Employee] ([ID]) ON DELETE CASCADE
GO
ALTER TABLE [admin].[EmployeeSkill] ADD CONSTRAINT [FK_EmployeeSkill_Skill] FOREIGN KEY ([SkillID]) REFERENCES [admin].[Skill] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Employee]'
GO
ALTER TABLE [admin].[Employee] ADD CONSTRAINT [FK_Employee_Company] FOREIGN KEY ([CompanyID]) REFERENCES [admin].[Company] ([ID])
GO
ALTER TABLE [admin].[Employee] ADD CONSTRAINT [FK_Employee_Supervisor] FOREIGN KEY ([SupervisorID]) REFERENCES [admin].[Employee] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EntityAIAction]'
GO
ALTER TABLE [admin].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_AIAction] FOREIGN KEY ([AIActionID]) REFERENCES [admin].[AIAction] ([ID])
GO
ALTER TABLE [admin].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_AIModel] FOREIGN KEY ([AIModelID]) REFERENCES [admin].[AIModel] ([ID])
GO
ALTER TABLE [admin].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[EntityAIAction] ADD CONSTRAINT [FK_EntityAIAction_Entity1] FOREIGN KEY ([OutputEntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EntityFieldValue]'
GO
ALTER TABLE [admin].[EntityFieldValue] ADD CONSTRAINT [FK_EntityFieldValue_EntityField] FOREIGN KEY ([EntityID], [EntityFieldName]) REFERENCES [admin].[EntityField] ([EntityID], [Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EntityField]'
GO
ALTER TABLE [admin].[EntityField] ADD CONSTRAINT [FK_EntityField_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[EntityField] ADD CONSTRAINT [FK_EntityField_EntityField] FOREIGN KEY ([RelatedEntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EntityPermission]'
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_CreateRLSFilter] FOREIGN KEY ([CreateRLSFilterID]) REFERENCES [admin].[RowLevelSecurityFilter] ([ID])
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_DeleteRLSFilter] FOREIGN KEY ([DeleteRLSFilterID]) REFERENCES [admin].[RowLevelSecurityFilter] ([ID])
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_ReadRLSFilter] FOREIGN KEY ([ReadRLSFilterID]) REFERENCES [admin].[RowLevelSecurityFilter] ([ID])
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_RoleName] FOREIGN KEY ([RoleName]) REFERENCES [admin].[Role] ([Name])
GO
ALTER TABLE [admin].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_UpdateRLSFilter] FOREIGN KEY ([UpdateRLSFilterID]) REFERENCES [admin].[RowLevelSecurityFilter] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[EntityRelationship]'
GO
ALTER TABLE [admin].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_EntityID] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_RelatedEntityID] FOREIGN KEY ([RelatedEntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_UserView1] FOREIGN KEY ([DisplayUserViewGUID]) REFERENCES [admin].[UserView] ([GUID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Entity]'
GO
ALTER TABLE [admin].[Entity] ADD CONSTRAINT [FK_Entity_Entity] FOREIGN KEY ([ParentID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ErrorLog]'
GO
ALTER TABLE [admin].[ErrorLog] ADD CONSTRAINT [FK_ErrorLog_CompanyIntegrationRunDetailID] FOREIGN KEY ([CompanyIntegrationRunDetailID]) REFERENCES [admin].[CompanyIntegrationRunDetail] ([ID])
GO
ALTER TABLE [admin].[ErrorLog] ADD CONSTRAINT [FK_ErrorLog_CompanyIntegrationRunID] FOREIGN KEY ([CompanyIntegrationRunID]) REFERENCES [admin].[CompanyIntegrationRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[IntegrationURLFormat]'
GO
ALTER TABLE [admin].[IntegrationURLFormat] ADD CONSTRAINT [FK_IntegrationURLFormat_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[IntegrationURLFormat] ADD CONSTRAINT [FK_IntegrationURLFormat_Integration1] FOREIGN KEY ([IntegrationName]) REFERENCES [admin].[Integration] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ListDetail]'
GO
ALTER TABLE [admin].[ListDetail] ADD CONSTRAINT [FK_ListDetail_List] FOREIGN KEY ([ListID]) REFERENCES [admin].[List] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[List]'
GO
ALTER TABLE [admin].[List] ADD CONSTRAINT [FK_List_CompanyIntegration] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [admin].[CompanyIntegration] ([ID])
GO
ALTER TABLE [admin].[List] ADD CONSTRAINT [FK_List_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[List] ADD CONSTRAINT [FK_List_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[QueueTask]'
GO
ALTER TABLE [admin].[QueueTask] ADD CONSTRAINT [FK_QueueTask_Queue] FOREIGN KEY ([QueueID]) REFERENCES [admin].[Queue] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Queue]'
GO
ALTER TABLE [admin].[Queue] ADD CONSTRAINT [FK_Queue_QueueType] FOREIGN KEY ([QueueTypeID]) REFERENCES [admin].[QueueType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[RecordChange]'
GO
ALTER TABLE [admin].[RecordChange] ADD CONSTRAINT [FK_RecordChange_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[RecordChange] ADD CONSTRAINT [FK_RecordChange_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[RecordMergeDeletionLog]'
GO
ALTER TABLE [admin].[RecordMergeDeletionLog] ADD CONSTRAINT [FK_RecordMergeDeletionLog_RecordMergeLog] FOREIGN KEY ([RecordMergeLogID]) REFERENCES [admin].[RecordMergeLog] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[RecordMergeLog]'
GO
ALTER TABLE [admin].[RecordMergeLog] ADD CONSTRAINT [FK_RecordMergeLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[RecordMergeLog] ADD CONSTRAINT [FK_RecordMergeLog_User] FOREIGN KEY ([InitiatedByUserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ReportSnapshot]'
GO
ALTER TABLE [admin].[ReportSnapshot] ADD CONSTRAINT [FK__ReportSna__Repor__19241E82] FOREIGN KEY ([ReportID]) REFERENCES [admin].[Report] ([ID])
GO
ALTER TABLE [admin].[ReportSnapshot] ADD CONSTRAINT [FK__ReportSna__UserI__6BB324E4] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Report]'
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__Conversa__373E914E] FOREIGN KEY ([ConversationID]) REFERENCES [admin].[Conversation] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__OutputDe__5E353582] FOREIGN KEY ([OutputDeliveryTypeID]) REFERENCES [admin].[OutputDeliveryType] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__OutputEv__601D7DF4] FOREIGN KEY ([OutputEventID]) REFERENCES [admin].[OutputDeliveryType] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__OutputFo__5D411149] FOREIGN KEY ([OutputFormatTypeID]) REFERENCES [admin].[OutputFormatType] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__OutputTr__5C4CED10] FOREIGN KEY ([OutputTriggerTypeID]) REFERENCES [admin].[OutputTriggerType] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__OutputWo__6111A22D] FOREIGN KEY ([OutputWorkflowID]) REFERENCES [admin].[Workflow] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK__Report__UserID__5F2959BB] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
ALTER TABLE [admin].[Report] ADD CONSTRAINT [FK_Report_ConversationDetail] FOREIGN KEY ([ConversationDetailID]) REFERENCES [admin].[ConversationDetail] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ResourceFolder]'
GO
ALTER TABLE [admin].[ResourceFolder] ADD CONSTRAINT [FK_ResourceFolder_ResourceFolder] FOREIGN KEY ([ParentID]) REFERENCES [admin].[ResourceFolder] ([ID])
GO
ALTER TABLE [admin].[ResourceFolder] ADD CONSTRAINT [FK_ResourceFolder_ResourceTypeName] FOREIGN KEY ([ResourceTypeName]) REFERENCES [admin].[ResourceType] ([Name])
GO
ALTER TABLE [admin].[ResourceFolder] ADD CONSTRAINT [FK_ResourceFolder_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[ResourceType]'
GO
ALTER TABLE [admin].[ResourceType] ADD CONSTRAINT [FK__ResourceT__Entit__6D777912] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Skill]'
GO
ALTER TABLE [admin].[Skill] ADD CONSTRAINT [FK_Skill_Skill] FOREIGN KEY ([ParentID]) REFERENCES [admin].[Skill] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[SystemEvent]'
GO
ALTER TABLE [admin].[SystemEvent] ADD CONSTRAINT [FK__SystemEve__Entit__6E6B9D4B] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Tag]'
GO
ALTER TABLE [admin].[Tag] ADD CONSTRAINT [FK__Tag__ParentID__592635D8] FOREIGN KEY ([ParentID]) REFERENCES [admin].[Tag] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[TaggedItem]'
GO
ALTER TABLE [admin].[TaggedItem] ADD CONSTRAINT [FK__TaggedIte__Entit__714809F6] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[TaggedItem] ADD CONSTRAINT [FK__TaggedIte__TagID__77AABCF8] FOREIGN KEY ([TagID]) REFERENCES [admin].[Tag] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserApplicationEntity]'
GO
ALTER TABLE [admin].[UserApplicationEntity] ADD CONSTRAINT [FK_UserApplicationEntity_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[UserApplicationEntity] ADD CONSTRAINT [FK_UserApplicationEntity_UserApplication] FOREIGN KEY ([UserApplicationID]) REFERENCES [admin].[UserApplication] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserApplication]'
GO
ALTER TABLE [admin].[UserApplication] ADD CONSTRAINT [FK_UserApplication_Application] FOREIGN KEY ([ApplicationID]) REFERENCES [admin].[Application] ([ID])
GO
ALTER TABLE [admin].[UserApplication] ADD CONSTRAINT [FK_UserApplication_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserFavorite]'
GO
ALTER TABLE [admin].[UserFavorite] ADD CONSTRAINT [FK_UserFavorite_ApplicationUser] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
ALTER TABLE [admin].[UserFavorite] ADD CONSTRAINT [FK_UserFavorite_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserNotification]'
GO
ALTER TABLE [admin].[UserNotification] ADD CONSTRAINT [FK_UserNotification_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserRecordLog]'
GO
ALTER TABLE [admin].[UserRecordLog] ADD CONSTRAINT [FK_UserRecordLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[UserRecordLog] ADD CONSTRAINT [FK_UserRecordLog_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserRole]'
GO
ALTER TABLE [admin].[UserRole] ADD CONSTRAINT [FK_UserRole_RoleName] FOREIGN KEY ([RoleName]) REFERENCES [admin].[Role] ([Name])
GO
ALTER TABLE [admin].[UserRole] ADD CONSTRAINT [FK_UserRole_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserViewRunDetail]'
GO
ALTER TABLE [admin].[UserViewRunDetail] ADD CONSTRAINT [FK_UserViewRunDetail_UserViewRun] FOREIGN KEY ([UserViewRunID]) REFERENCES [admin].[UserViewRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserViewRun]'
GO
ALTER TABLE [admin].[UserViewRun] ADD CONSTRAINT [FK_UserViewRun_User] FOREIGN KEY ([RunByUserID]) REFERENCES [admin].[User] ([ID])
GO
ALTER TABLE [admin].[UserViewRun] ADD CONSTRAINT [FK_UserViewRun_UserView] FOREIGN KEY ([UserViewID]) REFERENCES [admin].[UserView] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[UserView]'
GO
ALTER TABLE [admin].[UserView] ADD CONSTRAINT [FK_UserView_Entity] FOREIGN KEY ([EntityID]) REFERENCES [admin].[Entity] ([ID])
GO
ALTER TABLE [admin].[UserView] ADD CONSTRAINT [FK_UserView_User] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[WorkflowRun]'
GO
ALTER TABLE [admin].[WorkflowRun] ADD CONSTRAINT [FK_WorkflowRun_Workflow1] FOREIGN KEY ([WorkflowName]) REFERENCES [admin].[Workflow] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Workflow]'
GO
ALTER TABLE [admin].[Workflow] ADD CONSTRAINT [FK_Workflow_Company] FOREIGN KEY ([CompanyName]) REFERENCES [admin].[Company] ([Name])
GO
ALTER TABLE [admin].[Workflow] ADD CONSTRAINT [FK_Workflow_WorkflowEngine1] FOREIGN KEY ([WorkflowEngineName]) REFERENCES [admin].[WorkflowEngine] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[WorkspaceItem]'
GO
ALTER TABLE [admin].[WorkspaceItem] ADD CONSTRAINT [FK__Workspace__Resou__73305268] FOREIGN KEY ([ResourceTypeID]) REFERENCES [admin].[ResourceType] ([ID])
GO
ALTER TABLE [admin].[WorkspaceItem] ADD CONSTRAINT [FK__Workspace__WorkS__2C538F61] FOREIGN KEY ([WorkSpaceID]) REFERENCES [admin].[Workspace] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [admin].[Workspace]'
GO
ALTER TABLE [admin].[Workspace] ADD CONSTRAINT [FK__Workspace__UserI__057AB683] FOREIGN KEY ([UserID]) REFERENCES [admin].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[UserViewRunDetail]'
GO
GRANT INSERT ON  [admin].[UserViewRunDetail] TO [cdp_Developer]
GO
GRANT INSERT ON  [admin].[UserViewRunDetail] TO [cdp_Integration]
GO
GRANT INSERT ON  [admin].[UserViewRunDetail] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateApplicationEntity]'
GO
GRANT EXECUTE ON  [admin].[spCreateApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateAuditLog]'
GO
GRANT EXECUTE ON  [admin].[spCreateAuditLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateAuditLog] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateAuditLog] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateCompanyIntegrationRecordMap]'
GO
GRANT EXECUTE ON  [admin].[spCreateCompanyIntegrationRecordMap] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateCompanyIntegrationRecordMap] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateCompany]'
GO
GRANT EXECUTE ON  [admin].[spCreateCompany] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateCompany] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateConversationDetail]'
GO
GRANT EXECUTE ON  [admin].[spCreateConversationDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateConversationDetail] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateConversationDetail] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateConversation]'
GO
GRANT EXECUTE ON  [admin].[spCreateConversation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateConversation] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateConversation] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateDashboard]'
GO
GRANT EXECUTE ON  [admin].[spCreateDashboard] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateEmployee]'
GO
GRANT EXECUTE ON  [admin].[spCreateEmployee] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateEmployee] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateEntityField]'
GO
GRANT EXECUTE ON  [admin].[spCreateEntityField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateEntityField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateEntityPermission]'
GO
GRANT EXECUTE ON  [admin].[spCreateEntityPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateEntityPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateEntityRelationship]'
GO
GRANT EXECUTE ON  [admin].[spCreateEntityRelationship] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateEntityRelationship] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateEntity]'
GO
GRANT EXECUTE ON  [admin].[spCreateEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateListDetail]'
GO
GRANT EXECUTE ON  [admin].[spCreateListDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateListDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateList]'
GO
GRANT EXECUTE ON  [admin].[spCreateList] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateList] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateQueueTask]'
GO
GRANT EXECUTE ON  [admin].[spCreateQueueTask] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateQueueTask] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateQueue]'
GO
GRANT EXECUTE ON  [admin].[spCreateQueue] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateQueue] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateRecordChange]'
GO
GRANT EXECUTE ON  [admin].[spCreateRecordChange] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateRecordChange] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateRecordChange] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateRecordMergeDeletionLog]'
GO
GRANT EXECUTE ON  [admin].[spCreateRecordMergeDeletionLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateRecordMergeDeletionLog] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateRecordMergeDeletionLog] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateRecordMergeLog]'
GO
GRANT EXECUTE ON  [admin].[spCreateRecordMergeLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateRecordMergeLog] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateRecordMergeLog] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateReportSnapshot]'
GO
GRANT EXECUTE ON  [admin].[spCreateReportSnapshot] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateReport]'
GO
GRANT EXECUTE ON  [admin].[spCreateReport] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserApplicationEntity]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserFavorite]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserFavorite] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserFavorite] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateUserFavorite] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserNotification]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserNotification] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserNotification] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateUserNotification] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserRole]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserRole] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateUserRole] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserViewRunDetail]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserViewRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserViewRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserViewRun]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserViewRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserViewRun] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateUserViewRun] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUserView]'
GO
GRANT EXECUTE ON  [admin].[spCreateUserView] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUserView] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateUserView] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateUser]'
GO
GRANT EXECUTE ON  [admin].[spCreateUser] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spCreateUser] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spCreateUser] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateWorkspaceItem]'
GO
GRANT EXECUTE ON  [admin].[spCreateWorkspaceItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spCreateWorkspace]'
GO
GRANT EXECUTE ON  [admin].[spCreateWorkspace] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteApplicationEntity]'
GO
GRANT EXECUTE ON  [admin].[spDeleteApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteCompany]'
GO
GRANT EXECUTE ON  [admin].[spDeleteCompany] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteCompany] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteConversationDetail]'
GO
GRANT EXECUTE ON  [admin].[spDeleteConversationDetail] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteConversation]'
GO
GRANT EXECUTE ON  [admin].[spDeleteConversation] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteDashboard]'
GO
GRANT EXECUTE ON  [admin].[spDeleteDashboard] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteEmployee]'
GO
GRANT EXECUTE ON  [admin].[spDeleteEmployee] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteEmployee] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteEntityField]'
GO
GRANT EXECUTE ON  [admin].[spDeleteEntityField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteEntityField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteEntityPermission]'
GO
GRANT EXECUTE ON  [admin].[spDeleteEntityPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteEntityPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteEntityRelationship]'
GO
GRANT EXECUTE ON  [admin].[spDeleteEntityRelationship] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteEntityRelationship] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteEntity]'
GO
GRANT EXECUTE ON  [admin].[spDeleteEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteListDetail]'
GO
GRANT EXECUTE ON  [admin].[spDeleteListDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteListDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteList]'
GO
GRANT EXECUTE ON  [admin].[spDeleteList] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteList] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteReportSnapshot]'
GO
GRANT EXECUTE ON  [admin].[spDeleteReportSnapshot] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteReport]'
GO
GRANT EXECUTE ON  [admin].[spDeleteReport] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteUserApplicationEntity]'
GO
GRANT EXECUTE ON  [admin].[spDeleteUserApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteUserApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteUserFavorite]'
GO
GRANT EXECUTE ON  [admin].[spDeleteUserFavorite] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteUserFavorite] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spDeleteUserFavorite] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteUserView]'
GO
GRANT EXECUTE ON  [admin].[spDeleteUserView] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spDeleteUserView] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spDeleteUserView] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteWorkspaceItem]'
GO
GRANT EXECUTE ON  [admin].[spDeleteWorkspaceItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spDeleteWorkspace]'
GO
GRANT EXECUTE ON  [admin].[spDeleteWorkspace] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateAIAction]'
GO
GRANT EXECUTE ON  [admin].[spUpdateAIAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateAIAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateAIModelAction]'
GO
GRANT EXECUTE ON  [admin].[spUpdateAIModelAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateAIModelAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateAIModelType]'
GO
GRANT EXECUTE ON  [admin].[spUpdateAIModelType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateAIModelType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateAIModel]'
GO
GRANT EXECUTE ON  [admin].[spUpdateAIModel] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateAIModel] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateApplicationEntity]'
GO
GRANT EXECUTE ON  [admin].[spUpdateApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateApplication]'
GO
GRANT EXECUTE ON  [admin].[spUpdateApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateCompanyIntegrationRecordMap]'
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRecordMap] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRecordMap] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateCompanyIntegrationRunAPILog]'
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateCompanyIntegrationRunDetail]'
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateCompanyIntegrationRun]'
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegrationRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateCompanyIntegration]'
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegration] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateCompanyIntegration] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateCompany]'
GO
GRANT EXECUTE ON  [admin].[spUpdateCompany] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateCompany] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateConversationDetail]'
GO
GRANT EXECUTE ON  [admin].[spUpdateConversationDetail] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateConversation]'
GO
GRANT EXECUTE ON  [admin].[spUpdateConversation] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateDashboard]'
GO
GRANT EXECUTE ON  [admin].[spUpdateDashboard] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEmployeeCompanyIntegration]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployeeCompanyIntegration] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployeeCompanyIntegration] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEmployeeRole]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployeeRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployeeRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEmployeeSkill]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployeeSkill] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployeeSkill] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEmployee]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployee] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEmployee] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEntityAIAction]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityAIAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityAIAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEntityField]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEntityPermission]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityPermission] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityPermission] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEntityRelationship]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityRelationship] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEntityRelationship] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateEntity]'
GO
GRANT EXECUTE ON  [admin].[spUpdateEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateErrorLog]'
GO
GRANT EXECUTE ON  [admin].[spUpdateErrorLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateErrorLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateIntegrationURLFormat]'
GO
GRANT EXECUTE ON  [admin].[spUpdateIntegrationURLFormat] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateIntegrationURLFormat] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateIntegration]'
GO
GRANT EXECUTE ON  [admin].[spUpdateIntegration] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateIntegration] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateListDetail]'
GO
GRANT EXECUTE ON  [admin].[spUpdateListDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateListDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateList]'
GO
GRANT EXECUTE ON  [admin].[spUpdateList] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateList] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateQueueTask]'
GO
GRANT EXECUTE ON  [admin].[spUpdateQueueTask] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateQueue]'
GO
GRANT EXECUTE ON  [admin].[spUpdateQueue] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateRecordMergeDeletionLog]'
GO
GRANT EXECUTE ON  [admin].[spUpdateRecordMergeDeletionLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateRecordMergeDeletionLog] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spUpdateRecordMergeDeletionLog] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateRecordMergeLog]'
GO
GRANT EXECUTE ON  [admin].[spUpdateRecordMergeLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateRecordMergeLog] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spUpdateRecordMergeLog] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateReportSnapshot]'
GO
GRANT EXECUTE ON  [admin].[spUpdateReportSnapshot] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateReport]'
GO
GRANT EXECUTE ON  [admin].[spUpdateReport] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateRole]'
GO
GRANT EXECUTE ON  [admin].[spUpdateRole] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateRole] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserApplicationEntity]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserApplicationEntity] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserApplicationEntity] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserApplication]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserFavorite]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserFavorite] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserFavorite] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserFavorite] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserNotification]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserNotification] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserNotification] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserNotification] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserRecordLog]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserRecordLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserRecordLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserViewRunDetail]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserViewRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserViewRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserViewRun]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserViewRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserViewRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUserView]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUserView] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserView] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [admin].[spUpdateUserView] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateUser]'
GO
GRANT EXECUTE ON  [admin].[spUpdateUser] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateUser] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateWorkflowEngine]'
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkflowEngine] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkflowEngine] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateWorkflowRun]'
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkflowRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkflowRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateWorkflow]'
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkflow] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkflow] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateWorkspaceItem]'
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkspaceItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[spUpdateWorkspace]'
GO
GRANT EXECUTE ON  [admin].[spUpdateWorkspace] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAIActions]'
GO
GRANT SELECT ON  [admin].[vwAIActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAIActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAIActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAIModelActions]'
GO
GRANT SELECT ON  [admin].[vwAIModelActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAIModelActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAIModelActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAIModelTypes]'
GO
GRANT SELECT ON  [admin].[vwAIModelTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAIModelTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAIModelTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAIModels]'
GO
GRANT SELECT ON  [admin].[vwAIModels] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAIModels] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAIModels] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwApplicationEntities]'
GO
GRANT SELECT ON  [admin].[vwApplicationEntities] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwApplicationEntities] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwApplicationEntities] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwApplications]'
GO
GRANT SELECT ON  [admin].[vwApplications] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwApplications] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwApplications] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAuditLogTypes]'
GO
GRANT SELECT ON  [admin].[vwAuditLogTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAuditLogTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAuditLogTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAuditLogs]'
GO
GRANT SELECT ON  [admin].[vwAuditLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAuditLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAuditLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAuthorizationRoles]'
GO
GRANT SELECT ON  [admin].[vwAuthorizationRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAuthorizationRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAuthorizationRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwAuthorizations]'
GO
GRANT SELECT ON  [admin].[vwAuthorizations] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwAuthorizations] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwAuthorizations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwCompanies]'
GO
GRANT SELECT ON  [admin].[vwCompanies] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwCompanies] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwCompanies] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwCompanyIntegrationRecordMaps]'
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRecordMaps] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRecordMaps] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRecordMaps] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwCompanyIntegrationRunAPILogs]'
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRunAPILogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRunAPILogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRunAPILogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwCompanyIntegrationRunDetails]'
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRunDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRunDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRunDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwCompanyIntegrationRuns]'
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrationRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwCompanyIntegrations]'
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrations] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrations] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwCompanyIntegrations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwConversationDetails]'
GO
GRANT SELECT ON  [admin].[vwConversationDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwConversationDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwConversationDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwConversations]'
GO
GRANT SELECT ON  [admin].[vwConversations] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwConversations] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwConversations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwDashboards]'
GO
GRANT SELECT ON  [admin].[vwDashboards] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwDatasetItems]'
GO
GRANT SELECT ON  [admin].[vwDatasetItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwDatasetItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwDatasetItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwDatasets]'
GO
GRANT SELECT ON  [admin].[vwDatasets] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwDatasets] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwDatasets] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEmployeeCompanyIntegrations]'
GO
GRANT SELECT ON  [admin].[vwEmployeeCompanyIntegrations] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEmployeeCompanyIntegrations] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEmployeeCompanyIntegrations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEmployeeRoles]'
GO
GRANT SELECT ON  [admin].[vwEmployeeRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEmployeeRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEmployeeRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEmployeeSkills]'
GO
GRANT SELECT ON  [admin].[vwEmployeeSkills] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEmployeeSkills] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEmployeeSkills] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEmployees]'
GO
GRANT SELECT ON  [admin].[vwEmployees] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEmployees] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEmployees] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEntities]'
GO
GRANT SELECT ON  [admin].[vwEntities] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEntities] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEntities] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEntityAIActions]'
GO
GRANT SELECT ON  [admin].[vwEntityAIActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEntityAIActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEntityAIActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEntityFieldValues]'
GO
GRANT SELECT ON  [admin].[vwEntityFieldValues] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEntityFieldValues] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEntityFieldValues] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEntityFields]'
GO
GRANT SELECT ON  [admin].[vwEntityFields] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEntityFields] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEntityFields] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEntityPermissions]'
GO
GRANT SELECT ON  [admin].[vwEntityPermissions] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEntityPermissions] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEntityPermissions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwEntityRelationships]'
GO
GRANT SELECT ON  [admin].[vwEntityRelationships] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwEntityRelationships] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwEntityRelationships] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwErrorLogs]'
GO
GRANT SELECT ON  [admin].[vwErrorLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwErrorLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwErrorLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwIntegrationURLFormats]'
GO
GRANT SELECT ON  [admin].[vwIntegrationURLFormats] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwIntegrationURLFormats] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwIntegrationURLFormats] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwIntegrations]'
GO
GRANT SELECT ON  [admin].[vwIntegrations] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwIntegrations] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwIntegrations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwListDetails]'
GO
GRANT SELECT ON  [admin].[vwListDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwListDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwListDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwLists]'
GO
GRANT SELECT ON  [admin].[vwLists] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwLists] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwLists] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwOutputDeliveryTypes]'
GO
GRANT SELECT ON  [admin].[vwOutputDeliveryTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwOutputFormatTypes]'
GO
GRANT SELECT ON  [admin].[vwOutputFormatTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwOutputTriggerTypes]'
GO
GRANT SELECT ON  [admin].[vwOutputTriggerTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwQueueTasks]'
GO
GRANT SELECT ON  [admin].[vwQueueTasks] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwQueueTasks] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwQueueTypes]'
GO
GRANT SELECT ON  [admin].[vwQueueTypes] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwQueues]'
GO
GRANT SELECT ON  [admin].[vwQueues] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwQueues] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwRecordChanges]'
GO
GRANT SELECT ON  [admin].[vwRecordChanges] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwRecordChanges] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwRecordChanges] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwRecordMergeDeletionLogs]'
GO
GRANT SELECT ON  [admin].[vwRecordMergeDeletionLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwRecordMergeDeletionLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwRecordMergeDeletionLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwRecordMergeLogs]'
GO
GRANT SELECT ON  [admin].[vwRecordMergeLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwRecordMergeLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwRecordMergeLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwReportSnapshots]'
GO
GRANT SELECT ON  [admin].[vwReportSnapshots] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwReports]'
GO
GRANT SELECT ON  [admin].[vwReports] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwResourceTypes]'
GO
GRANT SELECT ON  [admin].[vwResourceTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwRoles]'
GO
GRANT SELECT ON  [admin].[vwRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwRowLevelSecurityFilters]'
GO
GRANT SELECT ON  [admin].[vwRowLevelSecurityFilters] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwRowLevelSecurityFilters] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwRowLevelSecurityFilters] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwSkills]'
GO
GRANT SELECT ON  [admin].[vwSkills] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwSkills] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwSkills] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwTaggedItems]'
GO
GRANT SELECT ON  [admin].[vwTaggedItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwTags]'
GO
GRANT SELECT ON  [admin].[vwTags] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserApplicationEntities]'
GO
GRANT SELECT ON  [admin].[vwUserApplicationEntities] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserApplicationEntities] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserApplicationEntities] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserApplications]'
GO
GRANT SELECT ON  [admin].[vwUserApplications] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserApplications] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserApplications] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserFavorites]'
GO
GRANT SELECT ON  [admin].[vwUserFavorites] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserFavorites] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserFavorites] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserNotifications]'
GO
GRANT SELECT ON  [admin].[vwUserNotifications] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserNotifications] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserNotifications] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserRecordLogs]'
GO
GRANT SELECT ON  [admin].[vwUserRecordLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserRecordLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserRecordLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserRoles]'
GO
GRANT SELECT ON  [admin].[vwUserRoles] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserRoles] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserRoles] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserViewRunDetails]'
GO
GRANT SELECT ON  [admin].[vwUserViewRunDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserViewRunDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserViewRunDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserViewRuns]'
GO
GRANT SELECT ON  [admin].[vwUserViewRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserViewRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserViewRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUserViews]'
GO
GRANT SELECT ON  [admin].[vwUserViews] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUserViews] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUserViews] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwUsers]'
GO
GRANT SELECT ON  [admin].[vwUsers] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwUsers] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwUsers] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwWorkflowEngines]'
GO
GRANT SELECT ON  [admin].[vwWorkflowEngines] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwWorkflowEngines] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwWorkflowEngines] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwWorkflowRuns]'
GO
GRANT SELECT ON  [admin].[vwWorkflowRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwWorkflowRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwWorkflowRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwWorkflows]'
GO
GRANT SELECT ON  [admin].[vwWorkflows] TO [cdp_Developer]
GO
GRANT SELECT ON  [admin].[vwWorkflows] TO [cdp_Integration]
GO
GRANT SELECT ON  [admin].[vwWorkflows] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwWorkspaceItems]'
GO
GRANT SELECT ON  [admin].[vwWorkspaceItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [admin].[vwWorkspaces]'
GO
GRANT SELECT ON  [admin].[vwWorkspaces] TO [cdp_UI]
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
