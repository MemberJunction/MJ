/*
	MemberJunction v2.0.x STRUCTURE Installation Script
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
PRINT N'Altering members of role db_owner'
GO
ALTER ROLE [db_owner] ADD MEMBER [MJ_CodeGen]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER ROLE [db_owner] ADD MEMBER [MJ_CodeGen_Dev]
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
PRINT N'Creating [__mj].[ActionResultCode]'
GO
CREATE TABLE [__mj].[ActionResultCode]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionRes__NewID__46207A68] DEFAULT (newsequentialid()),
[ActionID] [uniqueidentifier] NOT NULL,
[ResultCode] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsSuccess] [bit] NOT NULL CONSTRAINT [DF_ActionResultCode_IsSuccess] DEFAULT ((0)),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionRes____mj___60A4C411] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionRes____mj___6198E84A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionResultCode_ID] on [__mj].[ActionResultCode]'
GO
ALTER TABLE [__mj].[ActionResultCode] ADD CONSTRAINT [PK_ActionResultCode_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionResultCode] on [__mj].[ActionResultCode]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionResultCode]
ON [__mj].[ActionResultCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionResultCode] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionFilter]'
GO
CREATE TABLE [__mj].[ActionFilter]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionFilte__ID___31D0344F] DEFAULT (newsequentialid()),
[UserDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Code] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CodeExplanation] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionFilter___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionFilter___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionFilter] on [__mj].[ActionFilter]'
GO
ALTER TABLE [__mj].[ActionFilter] ADD CONSTRAINT [PK_ActionFilter] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionFilter] on [__mj].[ActionFilter]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionFilter]
ON [__mj].[ActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionFilter]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionFilter] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityField]'
GO
CREATE TABLE [__mj].[EntityField]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_EntityField_ID_] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
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
[CodeType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
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
[RelatedEntityID] [uniqueidentifier] NULL,
[RelatedEntityFieldName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IncludeRelatedEntityNameFieldInBaseView] [bit] NOT NULL CONSTRAINT [DF_EntityField_IncludeRelatedEntityNameFieldInBaseView] DEFAULT ((1)),
[RelatedEntityNameFieldMap] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RelatedEntityDisplayType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityField_RelatedEntityDisplayType] DEFAULT (N'Search'),
[EntityIDFieldName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityField___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityField___mj_UpdatedAt] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateEntityField] on [__mj].[EntityField]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityField]
ON [__mj].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityField]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[VersionInstallation]'
GO
CREATE TABLE [__mj].[VersionInstallation]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__VersionIn__NewID__1A8CDC44] DEFAULT (newsequentialid()),
[MajorVersion] [int] NOT NULL,
[MinorVersion] [int] NOT NULL,
[PatchVersion] [int] NOT NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL CONSTRAINT [DF_VersionInstallation_Type] DEFAULT (N'System'),
[InstalledAt] [datetime] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_VersionInstallation_Status] DEFAULT (N'Pending'),
[InstallLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VersionIn____mj___55331165] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VersionIn____mj___5627359E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_VersionInstallation_ID] on [__mj].[VersionInstallation]'
GO
ALTER TABLE [__mj].[VersionInstallation] ADD CONSTRAINT [PK_VersionInstallation_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateVersionInstallation] on [__mj].[VersionInstallation]'
GO

CREATE TRIGGER [__mj].[trgUpdateVersionInstallation]
ON [__mj].[VersionInstallation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VersionInstallation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[VersionInstallation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Report]'
GO
CREATE TABLE [__mj].[Report]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Report__ID___5F96FEFF] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [uniqueidentifier] NULL,
[UserID] [uniqueidentifier] NOT NULL,
[SharingScope] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Report_SharingScope] DEFAULT (N'Personal'),
[ConversationID] [uniqueidentifier] NULL,
[ConversationDetailID] [uniqueidentifier] NULL,
[DataContextID] [uniqueidentifier] NULL,
[Configuration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OutputTriggerTypeID] [uniqueidentifier] NULL,
[OutputFormatTypeID] [uniqueidentifier] NULL,
[OutputDeliveryTypeID] [uniqueidentifier] NULL,
[OutputFrequency] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OutputTargetEmail] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OutputWorkflowID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Report____mj_Cre__239BB5D1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Report____mj_Upd__248FDA0A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Report_ID] on [__mj].[Report]'
GO
ALTER TABLE [__mj].[Report] ADD CONSTRAINT [PK_Report_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateReport] on [__mj].[Report]'
GO

CREATE TRIGGER [__mj].[trgUpdateReport]
ON [__mj].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Report]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Report] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[User]'
GO
CREATE TABLE [__mj].[User]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__User__ID___69206939] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[FirstName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LastName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Title] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Email] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Type] [nchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_User_IsActive] DEFAULT ((0)),
[LinkedRecordType] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_User_LinkedRecordType] DEFAULT (N'None'),
[LinkedEntityID] [uniqueidentifier] NULL,
[LinkedEntityRecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EmployeeID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_User___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_User___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_User_ID] on [__mj].[User]'
GO
ALTER TABLE [__mj].[User] ADD CONSTRAINT [PK_User_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUser] on [__mj].[User]'
GO

CREATE TRIGGER [__mj].[trgUpdateUser]
ON [__mj].[User]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[User]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[User] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[FileEntityRecordLink]'
GO
CREATE TABLE [__mj].[FileEntityRecordLink]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__FileEntit__NewID__0D9CF57A] DEFAULT (newsequentialid()),
[FileID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileEntit____mj___534AC8F3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileEntit____mj___543EED2C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_FileEntityRecordLink_ID] on [__mj].[FileEntityRecordLink]'
GO
ALTER TABLE [__mj].[FileEntityRecordLink] ADD CONSTRAINT [PK_FileEntityRecordLink_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFileEntityRecordLink] on [__mj].[FileEntityRecordLink]'
GO

CREATE TRIGGER [__mj].[trgUpdateFileEntityRecordLink]
ON [__mj].[FileEntityRecordLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileEntityRecordLink]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[FileEntityRecordLink] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ReportSnapshot]'
GO
CREATE TABLE [__mj].[ReportSnapshot]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ReportSna__NewID__11387C34] DEFAULT (newsequentialid()),
[ReportID] [uniqueidentifier] NOT NULL,
[ResultSet] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportSna____mj___2583FE43] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportSna____mj___2678227C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ReportSnapshot_ID] on [__mj].[ReportSnapshot]'
GO
ALTER TABLE [__mj].[ReportSnapshot] ADD CONSTRAINT [PK_ReportSnapshot_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateReportSnapshot] on [__mj].[ReportSnapshot]'
GO

CREATE TRIGGER [__mj].[trgUpdateReportSnapshot]
ON [__mj].[ReportSnapshot]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportSnapshot]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ReportSnapshot] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocument]'
GO
CREATE TABLE [__mj].[EntityDocument]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityDocum__ID___4B900652] DEFAULT (newsequentialid()),
[Name] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[TypeID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[VectorDatabaseID] [uniqueidentifier] NOT NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityDocument_Status] DEFAULT (N'Active'),
[TemplateID] [uniqueidentifier] NOT NULL,
[AIModelID] [uniqueidentifier] NOT NULL,
[PotentialMatchThreshold] [numeric] (12, 11) NOT NULL CONSTRAINT [DF_EntityDocument_PotentialMatchThreshold] DEFAULT ((1)),
[AbsoluteMatchThreshold] [numeric] (12, 11) NOT NULL CONSTRAINT [DF_EntityDocument_AbsoluteMatchTreshhold] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocument___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocument___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocument_ID] on [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [PK_EntityDocument_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_EntityDocument_Name] on [__mj].[EntityDocument]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_EntityDocument_Name] ON [__mj].[EntityDocument] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocument] on [__mj].[EntityDocument]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityDocument]
ON [__mj].[EntityDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocument]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocument] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[VectorDatabase]'
GO
CREATE TABLE [__mj].[VectorDatabase]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__VectorDatab__ID___6DE51E56] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultURL] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ClassKey] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorDat____mj___42203CF1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorDat____mj___4314612A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_VectorDatabase_ID] on [__mj].[VectorDatabase]'
GO
ALTER TABLE [__mj].[VectorDatabase] ADD CONSTRAINT [PK_VectorDatabase_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateVectorDatabase] on [__mj].[VectorDatabase]'
GO

CREATE TRIGGER [__mj].[trgUpdateVectorDatabase]
ON [__mj].[VectorDatabase]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorDatabase]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[VectorDatabase] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionParam]'
GO
CREATE TABLE [__mj].[ActionParam]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionParam__ID___32C45888] DEFAULT (newsequentialid()),
[ActionID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DefaultValue] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ValueType] [nvarchar] (30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsArray] [bit] NOT NULL CONSTRAINT [DF__ActionPar__IsArr__714CCE00] DEFAULT ((0)),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsRequired] [bit] NOT NULL CONSTRAINT [DF__ActionPar__IsReq__7240F239] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionPar____mj___665D9D67] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionPar____mj___6751C1A0] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionParam_1] on [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [PK_ActionParam_1] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionParam] on [__mj].[ActionParam]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionParam]
ON [__mj].[ActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DataContextItem]'
GO
CREATE TABLE [__mj].[DataContextItem]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__DataConte__NewID__2B976CB5] DEFAULT (newsequentialid()),
[DataContextID] [uniqueidentifier] NOT NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ViewID] [uniqueidentifier] NULL,
[QueryID] [uniqueidentifier] NULL,
[EntityID] [uniqueidentifier] NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DataJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LastRefreshedAt] [datetime] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___44088563] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___44FCA99C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DataContextItem_ID] on [__mj].[DataContextItem]'
GO
ALTER TABLE [__mj].[DataContextItem] ADD CONSTRAINT [PK_DataContextItem_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDataContextItem] on [__mj].[DataContextItem]'
GO

CREATE TRIGGER [__mj].[trgUpdateDataContextItem]
ON [__mj].[DataContextItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContextItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DataContextItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecommendationRun]'
GO
CREATE TABLE [__mj].[RecommendationRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Recommendat__ID___5CBA9254] DEFAULT (newsequentialid()),
[RecommendationProviderID] [uniqueidentifier] NOT NULL,
[StartDate] [datetime] NOT NULL,
[EndDate] [datetime] NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RunByUserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___02F9DC15] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___03EE004E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecommendationRun_ID] on [__mj].[RecommendationRun]'
GO
ALTER TABLE [__mj].[RecommendationRun] ADD CONSTRAINT [PK_RecommendationRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendationRun] on [__mj].[RecommendationRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecommendationRun]
ON [__mj].[RecommendationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecommendationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocumentSetting]'
GO
CREATE TABLE [__mj].[EntityDocumentSetting]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityDoc__NewID__5E22EC82] DEFAULT (newsequentialid()),
[EntityDocumentID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentSetting___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentSetting___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocumentSetting_ID] on [__mj].[EntityDocumentSetting]'
GO
ALTER TABLE [__mj].[EntityDocumentSetting] ADD CONSTRAINT [PK_EntityDocumentSetting_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocumentSetting] on [__mj].[EntityDocumentSetting]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityDocumentSetting]
ON [__mj].[EntityDocumentSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentSetting]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocumentSetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Recommendation]'
GO
CREATE TABLE [__mj].[Recommendation]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Recommendat__ID___5AD249E2] DEFAULT (newsequentialid()),
[RecommendationRunID] [uniqueidentifier] NOT NULL,
[SourceEntityID] [uniqueidentifier] NOT NULL,
[SourceEntityRecordID] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___7F294B31] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___001D6F6A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Recommendation_ID] on [__mj].[Recommendation]'
GO
ALTER TABLE [__mj].[Recommendation] ADD CONSTRAINT [PK_Recommendation_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendation] on [__mj].[Recommendation]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecommendation]
ON [__mj].[Recommendation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Recommendation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Recommendation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecommendationItem]'
GO
CREATE TABLE [__mj].[RecommendationItem]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Recommend__NewID__6371B184] DEFAULT (newsequentialid()),
[RecommendationID] [uniqueidentifier] NOT NULL,
[DestinationEntityID] [uniqueidentifier] NOT NULL,
[DestinationEntityRecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MatchProbability] [decimal] (18, 15) NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___04E22487] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___05D648C0] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecommendationItem_ID] on [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] ADD CONSTRAINT [PK_RecommendationItem_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_RecommendationItem_EntityID] on [__mj].[RecommendationItem]'
GO
CREATE NONCLUSTERED INDEX [IX_RecommendationItem_EntityID] ON [__mj].[RecommendationItem] ([DestinationEntityID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_RecommendationItem_EntityRecordID] on [__mj].[RecommendationItem]'
GO
CREATE NONCLUSTERED INDEX [IX_RecommendationItem_EntityRecordID] ON [__mj].[RecommendationItem] ([DestinationEntityRecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendationItem] on [__mj].[RecommendationItem]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecommendationItem]
ON [__mj].[RecommendationItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecommendationItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRecordMap]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRecordMap]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__CompanyIn__NewID__4DB77A8F] DEFAULT (newsequentialid()),
[CompanyIntegrationID] [uniqueidentifier] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[EntityRecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___3A7F1B29] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___3B733F62] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRecordMap_ID] on [__mj].[CompanyIntegrationRecordMap]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRecordMap] ADD CONSTRAINT [PK_CompanyIntegrationRecordMap_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRecordMap] on [__mj].[CompanyIntegrationRecordMap]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRecordMap]
ON [__mj].[CompanyIntegrationRecordMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRecordMap]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRecordMap] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordMergeDeletionLog]'
GO
CREATE TABLE [__mj].[RecordMergeDeletionLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__RecordMer__NewID__06BAEDC1] DEFAULT (newsequentialid()),
[RecordMergeLogID] [uniqueidentifier] NOT NULL,
[DeletedRecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordMergeDeletionLog_Status] DEFAULT (N'Pending'),
[ProcessingLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3E4FAC0D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3F43D046] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordMergeDeletionLog_ID] on [__mj].[RecordMergeDeletionLog]'
GO
ALTER TABLE [__mj].[RecordMergeDeletionLog] ADD CONSTRAINT [PK_RecordMergeDeletionLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecordMergeDeletionLog] on [__mj].[RecordMergeDeletionLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecordMergeDeletionLog]
ON [__mj].[RecordMergeDeletionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeDeletionLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecordMergeDeletionLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Employee]'
GO
CREATE TABLE [__mj].[Employee]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Employee__ID___47BF756E] DEFAULT (newsequentialid()),
[BCMID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_Employee_BCMID] DEFAULT (newid()),
[FirstName] [nvarchar] (30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[LastName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CompanyID] [uniqueidentifier] NOT NULL,
[SupervisorID] [uniqueidentifier] NULL,
[Title] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Email] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Phone] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Active] [bit] NOT NULL CONSTRAINT [DF__Employee__Active__5D95E53A] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Employee___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Employee___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Employee_ID] on [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [PK_Employee_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [UQ__Employee__Email] UNIQUE NONCLUSTERED ([Email])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployee] on [__mj].[Employee]'
GO

CREATE TRIGGER [__mj].[trgUpdateEmployee]
ON [__mj].[Employee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Employee]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Employee] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserFavorite]'
GO
CREATE TABLE [__mj].[UserFavorite]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserFavor__NewID__54EE8803] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserFavor____mj___64AA5F1F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserFavor____mj___659E8358] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserFavorite_ID] on [__mj].[UserFavorite]'
GO
ALTER TABLE [__mj].[UserFavorite] ADD CONSTRAINT [PK_UserFavorite_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_UserFavorite] on [__mj].[UserFavorite]'
GO
CREATE NONCLUSTERED INDEX [IX_UserFavorite] ON [__mj].[UserFavorite] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserFavorite] on [__mj].[UserFavorite]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserFavorite]
ON [__mj].[UserFavorite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserFavorite]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserFavorite] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Company]'
GO
CREATE TABLE [__mj].[Company]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Company__ID___3D41E6FB] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Website] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LogoURL] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Domain] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Company___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Company___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Company_ID] on [__mj].[Company]'
GO
ALTER TABLE [__mj].[Company] ADD CONSTRAINT [PK_Company_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Company]'
GO
ALTER TABLE [__mj].[Company] ADD CONSTRAINT [UQ_Company_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompany] on [__mj].[Company]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompany]
ON [__mj].[Company]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Company]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Company] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserApplicationEntity]'
GO
CREATE TABLE [__mj].[UserApplicationEntity]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserAppli__NewID__4A70F990] DEFAULT (newsequentialid()),
[UserApplicationID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_UserApplicationEntity_Sequence] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___77BD3393] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___78B157CC] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserApplicationEntity_ID] on [__mj].[UserApplicationEntity]'
GO
ALTER TABLE [__mj].[UserApplicationEntity] ADD CONSTRAINT [PK_UserApplicationEntity_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserApplicationEntity] on [__mj].[UserApplicationEntity]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserApplicationEntity]
ON [__mj].[UserApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserApplicationEntity]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserApplicationEntity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ApplicationEntity]'
GO
CREATE TABLE [__mj].[ApplicationEntity]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Applicati__NewID__0E0709CE] DEFAULT (newsequentialid()),
[ApplicationID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL,
[DefaultForNewUser] [bit] NOT NULL CONSTRAINT [DF_ApplicationEntity_DefaultForNewUser] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationEntity___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationEntity___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ApplicationEntity_ID] on [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [PK_ApplicationEntity_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateApplicationEntity] on [__mj].[ApplicationEntity]'
GO

CREATE TRIGGER [__mj].[trgUpdateApplicationEntity]
ON [__mj].[ApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationEntity]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ApplicationEntity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityPermission]'
GO
CREATE TABLE [__mj].[EntityPermission]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityPer__NewID__66B83283] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[RoleID] [uniqueidentifier] NOT NULL,
[CanCreate] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanCreate] DEFAULT ((0)),
[CanRead] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanRead] DEFAULT ((0)),
[CanUpdate] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanUpdate] DEFAULT ((0)),
[CanDelete] [bit] NOT NULL CONSTRAINT [DF_EntityPermission_CanDelete] DEFAULT ((0)),
[ReadRLSFilterID] [uniqueidentifier] NULL,
[CreateRLSFilterID] [uniqueidentifier] NULL,
[UpdateRLSFilterID] [uniqueidentifier] NULL,
[DeleteRLSFilterID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityPermission___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityPermission___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityPermission_ID] on [__mj].[EntityPermission]'
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [PK_EntityPermission_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityPermission] on [__mj].[EntityPermission]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityPermission]
ON [__mj].[EntityPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityPermission]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityPermission] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueryCategory]'
GO
CREATE TABLE [__mj].[QueryCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__QueryCatego__ID___57F5DD37] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [uniqueidentifier] NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryCategory___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryCategory___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueryCategory_ID] on [__mj].[QueryCategory]'
GO
ALTER TABLE [__mj].[QueryCategory] ADD CONSTRAINT [PK_QueryCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueryCategory] on [__mj].[QueryCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateQueryCategory]
ON [__mj].[QueryCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueryCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Action]'
GO
CREATE TABLE [__mj].[Action]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Action__ID___2EF3C7A4] DEFAULT (newsequentialid()),
[CategoryID] [uniqueidentifier] NULL,
[Name] [nvarchar] (425) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Action_Type] DEFAULT (N'Generated'),
[UserPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Code] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeApprovalStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Action__CodeAppr__745357DD] DEFAULT (N'Pending'),
[CodeApprovalComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeApprovedByUserID] [uniqueidentifier] NULL,
[CodeApprovedAt] [datetime] NULL,
[CodeLocked] [bit] NOT NULL CONSTRAINT [DF_Action_CodeLocked] DEFAULT ((0)),
[ForceCodeGeneration] [bit] NOT NULL CONSTRAINT [DF_Action_ForceGeneration] DEFAULT ((0)),
[RetentionPeriod] [int] NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Action__Status__763BA04F] DEFAULT (N'Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Action___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Action___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Action_ID] on [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [PK_Action_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [UQ_Action_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAction] on [__mj].[Action]'
GO

CREATE TRIGGER [__mj].[trgUpdateAction]
ON [__mj].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Action]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Action] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueryPermission]'
GO
CREATE TABLE [__mj].[QueryPermission]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__QueryPerm__NewID__4F6AB8D7] DEFAULT (newsequentialid()),
[QueryID] [uniqueidentifier] NOT NULL,
[RoleID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryPermission___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryPermission___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueryPermission_ID] on [__mj].[QueryPermission]'
GO
ALTER TABLE [__mj].[QueryPermission] ADD CONSTRAINT [PK_QueryPermission_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueryPermission] on [__mj].[QueryPermission]'
GO

CREATE TRIGGER [__mj].[trgUpdateQueryPermission]
ON [__mj].[QueryPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryPermission]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueryPermission] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionFilter]'
GO
CREATE TABLE [__mj].[EntityActionFilter]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityAct__NewID__6CA61603] DEFAULT (newsequentialid()),
[EntityActionID] [uniqueidentifier] NOT NULL,
[ActionFilterID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__EntityAct__Statu__25EAB371] DEFAULT ('Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionFilter___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionFilter___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityActionFilter_ID] on [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [PK_EntityActionFilter_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionFilter] on [__mj].[EntityActionFilter]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityActionFilter]
ON [__mj].[EntityActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionFilter]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionFilter] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Query]'
GO
CREATE TABLE [__mj].[Query]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Query__ID___5701B8FE] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CategoryID] [uniqueidentifier] NULL,
[UserQuestion] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TechnicalDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[OriginalSQL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Feedback] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Quey_Status] DEFAULT (N'Pending'),
[QualityRank] [int] NULL CONSTRAINT [DF_Quey_QualityRank] DEFAULT ((0)),
[ExecutionCostRank] [int] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Query___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Query___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Query_ID] on [__mj].[Query]'
GO
ALTER TABLE [__mj].[Query] ADD CONSTRAINT [PK_Query_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQuery] on [__mj].[Query]'
GO

CREATE TRIGGER [__mj].[trgUpdateQuery]
ON [__mj].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Query]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Query] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[WorkflowRun]'
GO
CREATE TABLE [__mj].[WorkflowRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__WorkflowR__NewID__25FE8EF0] DEFAULT (newsequentialid()),
[WorkflowID] [uniqueidentifier] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[StartedAt] [datetime] NOT NULL,
[EndedAt] [datetime] NULL,
[Status] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_WorkflowRun_Status] DEFAULT (N'Pending'),
[Results] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowR____mj___05172EB1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowR____mj___060B52EA] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_WorkflowRun_ID] on [__mj].[WorkflowRun]'
GO
ALTER TABLE [__mj].[WorkflowRun] ADD CONSTRAINT [PK_WorkflowRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkflowRun] on [__mj].[WorkflowRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateWorkflowRun]
ON [__mj].[WorkflowRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[WorkflowRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ListDetail]'
GO
CREATE TABLE [__mj].[ListDetail]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ListDetai__NewID__3A6F9BF1] DEFAULT (newsequentialid()),
[ListID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (445) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_ListDetail_Sequence] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListDetai____mj___7F5E555B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListDetai____mj___00527994] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ListDetail_ID] on [__mj].[ListDetail]'
GO
ALTER TABLE [__mj].[ListDetail] ADD CONSTRAINT [PK_ListDetail_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_ListDetail_ListID] on [__mj].[ListDetail]'
GO
CREATE NONCLUSTERED INDEX [IX_ListDetail_ListID] ON [__mj].[ListDetail] ([ListID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_ListDetail_RecordID] on [__mj].[ListDetail]'
GO
CREATE NONCLUSTERED INDEX [IX_ListDetail_RecordID] ON [__mj].[ListDetail] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateListDetail] on [__mj].[ListDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateListDetail]
ON [__mj].[ListDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ListDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserViewRunDetail]'
GO
CREATE TABLE [__mj].[UserViewRunDetail]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserViewR__NewID__086E2C09] DEFAULT (newsequentialid()),
[UserViewRunID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___032EE63F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___04230A78] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewRunDetail_ID] on [__mj].[UserViewRunDetail]'
GO
ALTER TABLE [__mj].[UserViewRunDetail] ADD CONSTRAINT [PK_UserViewRunDetail_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_UserViewRunDetail_RecordID] on [__mj].[UserViewRunDetail]'
GO
CREATE NONCLUSTERED INDEX [IX_UserViewRunDetail_RecordID] ON [__mj].[UserViewRunDetail] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserViewRunDetail] on [__mj].[UserViewRunDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserViewRunDetail]
ON [__mj].[UserViewRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewRunDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserViewRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserNotification]'
GO
CREATE TABLE [__mj].[UserNotification]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserNotif__NewID__5E77F23D] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[Title] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ResourceTypeID] [uniqueidentifier] NULL,
[ResourceRecordID] [int] NULL,
[ResourceConfiguration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Unread] [bit] NOT NULL CONSTRAINT [DF_Table_1_MarkedAsRead] DEFAULT ((1)),
[ReadAt] [datetime] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserNotif____mj___36AE8A45] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserNotif____mj___37A2AE7E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserNotification_ID] on [__mj].[UserNotification]'
GO
ALTER TABLE [__mj].[UserNotification] ADD CONSTRAINT [PK_UserNotification_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_UserNotification_UserID] on [__mj].[UserNotification]'
GO
CREATE NONCLUSTERED INDEX [IX_UserNotification_UserID] ON [__mj].[UserNotification] ([UserID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserNotification] on [__mj].[UserNotification]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserNotification]
ON [__mj].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserNotification]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserNotification] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Conversation]'
GO
CREATE TABLE [__mj].[Conversation]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Conversatio__ID___411277DF] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[ExternalID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Conversation_Type] DEFAULT (N'Skip'),
[IsArchived] [bit] NOT NULL CONSTRAINT [DF_Conversation_IsArchived] DEFAULT ((0)),
[LinkedEntityID] [uniqueidentifier] NULL,
[LinkedRecordID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DataContextID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___34C641D3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___35BA660C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Conversation_ID] on [__mj].[Conversation]'
GO
ALTER TABLE [__mj].[Conversation] ADD CONSTRAINT [PK_Conversation_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateConversation] on [__mj].[Conversation]'
GO

CREATE TRIGGER [__mj].[trgUpdateConversation]
ON [__mj].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Conversation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Conversation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DashboardCategory]'
GO
CREATE TABLE [__mj].[DashboardCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__DashboardCa__ID___42FAC051] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___49C15EB9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___4AB582F2] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DashboardCategory_ID] on [__mj].[DashboardCategory]'
GO
ALTER TABLE [__mj].[DashboardCategory] ADD CONSTRAINT [PK_DashboardCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDashboardCategory] on [__mj].[DashboardCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateDashboardCategory]
ON [__mj].[DashboardCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DashboardCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DashboardCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Application]'
GO
CREATE TABLE [__mj].[Application]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Application__ID___3694E96C] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Icon] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultForNewUser] [bit] NOT NULL CONSTRAINT [DF_Application_DefaultForNewUser] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Application___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Application___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Application_ID] on [__mj].[Application]'
GO
ALTER TABLE [__mj].[Application] ADD CONSTRAINT [PK_Application_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Application]'
GO
ALTER TABLE [__mj].[Application] ADD CONSTRAINT [UQ_Application_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateApplication] on [__mj].[Application]'
GO

CREATE TRIGGER [__mj].[trgUpdateApplication]
ON [__mj].[Application]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Application] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserApplication]'
GO
CREATE TABLE [__mj].[UserApplication]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserApplica__ID___6A148D72] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[ApplicationID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_UserApplication_Sequence] DEFAULT ((0)),
[IsActive] [bit] NOT NULL CONSTRAINT [DF_UserApplication_IsActive] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___79A57C05] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserAppli____mj___7A99A03E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserApplication_ID] on [__mj].[UserApplication]'
GO
ALTER TABLE [__mj].[UserApplication] ADD CONSTRAINT [PK_UserApplication_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserApplication] on [__mj].[UserApplication]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserApplication]
ON [__mj].[UserApplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserApplication]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserApplication] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserViewRun]'
GO
CREATE TABLE [__mj].[UserViewRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserViewRun__ID___6CF0FA1D] DEFAULT (newsequentialid()),
[UserViewID] [uniqueidentifier] NOT NULL,
[RunAt] [datetime] NOT NULL,
[RunByUserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___01469DCD] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewR____mj___023AC206] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateUserViewRun] on [__mj].[UserViewRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserViewRun]
ON [__mj].[UserViewRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserViewRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[List]'
GO
CREATE TABLE [__mj].[List]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__List__ID___5331281A] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[UserID] [uniqueidentifier] NOT NULL,
[CategoryID] [uniqueidentifier] NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CompanyIntegrationID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__List____mj_Creat__7D760CE9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__List____mj_Updat__7E6A3122] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_List_ID] on [__mj].[List]'
GO
ALTER TABLE [__mj].[List] ADD CONSTRAINT [PK_List_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_List_Name] on [__mj].[List]'
GO
CREATE NONCLUSTERED INDEX [IX_List_Name] ON [__mj].[List] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateList] on [__mj].[List]'
GO

CREATE TRIGGER [__mj].[trgUpdateList]
ON [__mj].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[List]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[List] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ScheduledAction]'
GO
CREATE TABLE [__mj].[ScheduledAction]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ScheduledAct__ID__4A14FF90] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedByUserID] [uniqueidentifier] NOT NULL,
[ActionID] [uniqueidentifier] NOT NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CronExpression] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Timezone] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Scheduled__Statu__4B0923C9] DEFAULT ('Pending'),
[IntervalDays] [int] NULL,
[DayOfWeek] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DayOfMonth] [int] NULL,
[Month] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CustomCronExpression] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Scheduled____mj___0AB9948A] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Scheduled____mj___0BADB8C3] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Schedule__3214EC27A259AC9E] on [__mj].[ScheduledAction]'
GO
ALTER TABLE [__mj].[ScheduledAction] ADD CONSTRAINT [PK__Schedule__3214EC27A259AC9E] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateScheduledAction] on [__mj].[ScheduledAction]'
GO

CREATE TRIGGER [__mj].[trgUpdateScheduledAction]
ON [__mj].[ScheduledAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ScheduledAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ScheduledAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AuditLog]'
GO
CREATE TABLE [__mj].[AuditLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__AuditLog__NewID__405D7F71] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[AuditLogTypeID] [uniqueidentifier] NOT NULL,
[AuthorizationID] [uniqueidentifier] NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_AuditLog_Status] DEFAULT (N'Allow'),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Details] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [uniqueidentifier] NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AuditLog____mj_C__0AD00807] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AuditLog____mj_U__0BC42C40] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AuditLog_ID] on [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [PK_AuditLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAuditLog] on [__mj].[AuditLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateAuditLog]
ON [__mj].[AuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AuditLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AuditLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ScheduledActionParam]'
GO
CREATE TABLE [__mj].[ScheduledActionParam]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ScheduledAct__ID__7885D5B6] DEFAULT (newsequentialid()),
[ScheduledActionID] [uniqueidentifier] NOT NULL,
[ActionParamID] [uniqueidentifier] NOT NULL,
[ValueType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Scheduled____mj___3CFAFB94] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Scheduled____mj___3DEF1FCD] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Schedule__3214EC27EB11011E] on [__mj].[ScheduledActionParam]'
GO
ALTER TABLE [__mj].[ScheduledActionParam] ADD CONSTRAINT [PK__Schedule__3214EC27EB11011E] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateScheduledActionParam] on [__mj].[ScheduledActionParam]'
GO

CREATE TRIGGER [__mj].[trgUpdateScheduledActionParam]
ON [__mj].[ScheduledActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ScheduledActionParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ScheduledActionParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Library]'
GO
CREATE TABLE [__mj].[Library]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Library__ID___523D03E1] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Library__Status__740A0A71] DEFAULT ('Pending'),
[TypeDefinitions] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SampleCode] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Library___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Library___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Library_ID] on [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] ADD CONSTRAINT [PK_Library_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] ADD CONSTRAINT [UQ_Library_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateLibrary] on [__mj].[Library]'
GO

CREATE TRIGGER [__mj].[trgUpdateLibrary]
ON [__mj].[Library]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Library]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Library] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRun]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__CompanyInte__ID___3F2A2F6D] DEFAULT (newsequentialid()),
[CompanyIntegrationID] [uniqueidentifier] NOT NULL,
[RunByUserID] [uniqueidentifier] NOT NULL,
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[TotalRecords] [int] NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___72045A3D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___72F87E76] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRun_ID] on [__mj].[CompanyIntegrationRun]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRun] ADD CONSTRAINT [PK_CompanyIntegrationRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRun] on [__mj].[CompanyIntegrationRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRun]
ON [__mj].[CompanyIntegrationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserView]'
GO
CREATE TABLE [__mj].[UserView]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserView__ID___6B08B1AB] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [uniqueidentifier] NULL,
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
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserView___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserView___mj_UpdatedAt] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateUserView] on [__mj].[UserView]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserView]
ON [__mj].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserView]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserView] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionContextType]'
GO
CREATE TABLE [__mj].[ActionContextType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionConte__ID___30DC1016] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___5EBC7B9F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___5FB09FD8] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionContextType] on [__mj].[ActionContextType]'
GO
ALTER TABLE [__mj].[ActionContextType] ADD CONSTRAINT [PK_ActionContextType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionContextType] on [__mj].[ActionContextType]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionContextType]
ON [__mj].[ActionContextType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContextType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionContextType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocumentType]'
GO
CREATE TABLE [__mj].[EntityDocumentType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityDocum__ID___4C842A8B] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentType___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocumentType_ID] on [__mj].[EntityDocumentType]'
GO
ALTER TABLE [__mj].[EntityDocumentType] ADD CONSTRAINT [PK_EntityDocumentType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocumentType] on [__mj].[EntityDocumentType]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityDocumentType]
ON [__mj].[EntityDocumentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocumentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Workflow]'
GO
CREATE TABLE [__mj].[Workflow]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Workflow__ID___6ED9428F] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[WorkflowEngineID] [uniqueidentifier] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[AutoRunEnabled] [bit] NOT NULL CONSTRAINT [DF_Workflow_AutoRunEnabled] DEFAULT ((0)),
[AutoRunIntervalUnits] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AutoRunInterval] [int] NULL,
[SubclassName] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workflow____mj_C__06FF7723] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workflow____mj_U__07F39B5C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Workflow_ID] on [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [PK_Workflow_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [UQ_Workflow_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkflow] on [__mj].[Workflow]'
GO

CREATE TRIGGER [__mj].[trgUpdateWorkflow]
ON [__mj].[Workflow]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workflow]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Workflow] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[VectorIndex]'
GO
CREATE TABLE [__mj].[VectorIndex]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__VectorInd__NewID__1103720A] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[VectorDatabaseID] [uniqueidentifier] NOT NULL,
[EmbeddingModelID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorInd____mj___4037F47F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__VectorInd____mj___412C18B8] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_VectorIndex_ID] on [__mj].[VectorIndex]'
GO
ALTER TABLE [__mj].[VectorIndex] ADD CONSTRAINT [PK_VectorIndex_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateVectorIndex] on [__mj].[VectorIndex]'
GO

CREATE TRIGGER [__mj].[trgUpdateVectorIndex]
ON [__mj].[VectorIndex]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorIndex]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[VectorIndex] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityAction]'
GO
CREATE TABLE [__mj].[EntityAction]
(
[EntityID] [uniqueidentifier] NOT NULL,
[ActionID] [uniqueidentifier] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__EntityAct__Statu__1E4991A9] DEFAULT ('Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAction___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAction___mj_UpdatedAt] DEFAULT (getutcdate()),
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityActio__ID___48B399A7] DEFAULT (newsequentialid())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityAction_ID] on [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [PK_EntityAction_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityAction] on [__mj].[EntityAction]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityAction]
ON [__mj].[EntityAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordChangeReplayRun]'
GO
CREATE TABLE [__mj].[RecordChangeReplayRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__RecordChang__ID___5DAEB68D] DEFAULT (newsequentialid()),
[StartedAt] [datetime] NOT NULL,
[EndedAt] [datetime] NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordCha____mj___06CA6CF9] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordCha____mj___07BE9132] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordChangeReplayRun_ID] on [__mj].[RecordChangeReplayRun]'
GO
ALTER TABLE [__mj].[RecordChangeReplayRun] ADD CONSTRAINT [PK_RecordChangeReplayRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecordChangeReplayRun] on [__mj].[RecordChangeReplayRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecordChangeReplayRun]
ON [__mj].[RecordChangeReplayRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordChangeReplayRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecordChangeReplayRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionInvocationType]'
GO
CREATE TABLE [__mj].[EntityActionInvocationType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityActio__ID___49A7BDE0] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplaySequence] [int] NOT NULL CONSTRAINT [DF_EntityActionInvocationType_DisplaySequence] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocationType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocationType___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityActionInvocationType_ID] on [__mj].[EntityActionInvocationType]'
GO
ALTER TABLE [__mj].[EntityActionInvocationType] ADD CONSTRAINT [PK_EntityActionInvocationType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionInvocationType] on [__mj].[EntityActionInvocationType]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityActionInvocationType]
ON [__mj].[EntityActionInvocationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocationType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionInvocationType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityCommunicationField]'
GO
CREATE TABLE [__mj].[EntityCommunicationField]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityCom__NewID__4B10180E] DEFAULT (newsequentialid()),
[EntityCommunicationMessageTypeID] [uniqueidentifier] NOT NULL,
[FieldName] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Priority] [int] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationField___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationField___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityCommunicationField_ID] on [__mj].[EntityCommunicationField]'
GO
ALTER TABLE [__mj].[EntityCommunicationField] ADD CONSTRAINT [PK_EntityCommunicationField_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityCommunicationField] on [__mj].[EntityCommunicationField]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityCommunicationField]
ON [__mj].[EntityCommunicationField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationField]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityCommunicationField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionCategory]'
GO
CREATE TABLE [__mj].[ActionCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionCateg__ID___2FE7EBDD] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__ActionCat__Statu__6DA65A4E] DEFAULT ('Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionCategory___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionCategory___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionCa__3214EC27BA2348AF] on [__mj].[ActionCategory]'
GO
ALTER TABLE [__mj].[ActionCategory] ADD CONSTRAINT [PK__ActionCa__3214EC27BA2348AF] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionCategory] on [__mj].[ActionCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionCategory]
ON [__mj].[ActionCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateContent]'
GO
CREATE TABLE [__mj].[TemplateContent]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__TemplateC__NewID__338D9438] DEFAULT (newsequentialid()),
[TemplateID] [uniqueidentifier] NOT NULL,
[TypeID] [uniqueidentifier] NOT NULL,
[TemplateText] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Priority] [int] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__TemplateC__IsAct__347CC29D] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___797071DB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___7A649614] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TemplateContent_ID] on [__mj].[TemplateContent]'
GO
ALTER TABLE [__mj].[TemplateContent] ADD CONSTRAINT [PK_TemplateContent_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateContent] on [__mj].[TemplateContent]'
GO

CREATE TRIGGER [__mj].[trgUpdateTemplateContent]
ON [__mj].[TemplateContent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContent]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateContent] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateParam]'
GO
CREATE TABLE [__mj].[TemplateParam]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__TemplateP__NewID__3E0B22AB] DEFAULT (newsequentialid()),
[TemplateID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__TemplatePa__Type__4A6C03BC] DEFAULT ('Scalar'),
[DefaultValue] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsRequired] [bit] NOT NULL CONSTRAINT [DF_TemplateParam_IsRequired] DEFAULT ((0)),
[LinkedParameterName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[LinkedParameterField] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ExtraFilter] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [uniqueidentifier] NULL,
[RecordID] [nvarchar] (2000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateP____mj___7B58BA4D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateP____mj___7C4CDE86] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TemplateParam_ID] on [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] ADD CONSTRAINT [PK_TemplateParam_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateParam] on [__mj].[TemplateParam]'
GO

CREATE TRIGGER [__mj].[trgUpdateTemplateParam]
ON [__mj].[TemplateParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationBaseMessageType]'
GO
CREATE TABLE [__mj].[CommunicationBaseMessageType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Communicati__ID___39715617] DEFAULT (newsequentialid()),
[Type] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[SupportsAttachments] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__68C4D6FC] DEFAULT ((0)),
[SupportsSubjectLine] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__69B8FB35] DEFAULT ((0)),
[SupportsHtml] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__6AAD1F6E] DEFAULT ((0)),
[MaxBytes] [int] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___73B79885] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___74ABBCBE] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CommunicationBaseMessageType_ID] on [__mj].[CommunicationBaseMessageType]'
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] ADD CONSTRAINT [PK_CommunicationBaseMessageType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationBaseMessageType]'
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] ADD CONSTRAINT [UQ_CommunicationBaseMessageType_Type] UNIQUE NONCLUSTERED ([Type])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationBaseMessageType] on [__mj].[CommunicationBaseMessageType]'
GO

CREATE TRIGGER [__mj].[trgUpdateCommunicationBaseMessageType]
ON [__mj].[CommunicationBaseMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationBaseMessageType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationBaseMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueryField]'
GO
CREATE TABLE [__mj].[QueryField]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__QueryFiel__NewID__43F9062B] DEFAULT (newsequentialid()),
[QueryID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Sequence] [int] NOT NULL,
[SQLBaseType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[SQLFullType] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[SourceEntityID] [uniqueidentifier] NULL,
[SourceFieldName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsComputed] [bit] NOT NULL CONSTRAINT [DF_QueryField_IsComputed] DEFAULT ((0)),
[ComputationDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsSummary] [bit] NOT NULL CONSTRAINT [DF_QueryField_IsSummary] DEFAULT ((0)),
[SummaryDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryField___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_QueryField___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueryField_ID] on [__mj].[QueryField]'
GO
ALTER TABLE [__mj].[QueryField] ADD CONSTRAINT [PK_QueryField_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueryField] on [__mj].[QueryField]'
GO

CREATE TRIGGER [__mj].[trgUpdateQueryField]
ON [__mj].[QueryField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryField]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueryField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRunAPILog]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRunAPILog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__CompanyIn__NewID__5740E4C9] DEFAULT (newsequentialid()),
[CompanyIntegrationRunID] [uniqueidentifier] NOT NULL,
[ExecutedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegrationRunAPILog_ExecutedAt] DEFAULT (getdate()),
[IsSuccess] [bit] NOT NULL CONSTRAINT [DF__CompanyIn__IsSuc__753864A1] DEFAULT ((0)),
[RequestMethod] [nvarchar] (12) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[URL] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Parameters] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___7B8DC477] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___7C81E8B0] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRunAPILog_ID] on [__mj].[CompanyIntegrationRunAPILog]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunAPILog] ADD CONSTRAINT [PK_CompanyIntegrationRunAPILog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRunAPILog] on [__mj].[CompanyIntegrationRunAPILog]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRunAPILog]
ON [__mj].[CompanyIntegrationRunAPILog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRunAPILog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRunAPILog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionParam]'
GO
CREATE TABLE [__mj].[EntityActionParam]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityAct__NewID__03897B5B] DEFAULT (newsequentialid()),
[EntityActionID] [uniqueidentifier] NOT NULL,
[ActionParamID] [uniqueidentifier] NOT NULL,
[ValueType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityAct____mj___52EAD640] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityAct____mj___53DEFA79] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityActionParam_ID] on [__mj].[EntityActionParam]'
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [PK_EntityActionParam_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionParam] on [__mj].[EntityActionParam]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityActionParam]
ON [__mj].[EntityActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionParam]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ConversationDetail]'
GO
CREATE TABLE [__mj].[ConversationDetail]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Conversatio__ID___42069C18] DEFAULT (newsequentialid()),
[ConversationID] [uniqueidentifier] NOT NULL,
[ExternalID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Role] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_ConversationDetail_Role] DEFAULT (user_name()),
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Error] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[HiddenToUser] [bit] NOT NULL CONSTRAINT [DF_ConversationDetail_HiddenToUser] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___32DDF961] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Conversat____mj___33D21D9A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ConversationDetail_ID] on [__mj].[ConversationDetail]'
GO
ALTER TABLE [__mj].[ConversationDetail] ADD CONSTRAINT [PK_ConversationDetail_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateConversationDetail] on [__mj].[ConversationDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateConversationDetail]
ON [__mj].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ConversationDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ConversationDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EmployeeSkill]'
GO
CREATE TABLE [__mj].[EmployeeSkill]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EmployeeS__NewID__04138B40] DEFAULT (newsequentialid()),
[EmployeeID] [uniqueidentifier] NOT NULL,
[SkillID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeSkill___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeSkill___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EmployeeSkill_ID] on [__mj].[EmployeeSkill]'
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD CONSTRAINT [PK_EmployeeSkill_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployeeSkill] on [__mj].[EmployeeSkill]'
GO

CREATE TRIGGER [__mj].[trgUpdateEmployeeSkill]
ON [__mj].[EmployeeSkill]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeSkill]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EmployeeSkill] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ListCategory]'
GO
CREATE TABLE [__mj].[ListCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ListCateg__NewID__2A393428] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListCateg____mj___6A2E2E4B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ListCateg____mj___6B225284] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ListCategory_ID] on [__mj].[ListCategory]'
GO
ALTER TABLE [__mj].[ListCategory] ADD CONSTRAINT [PK_ListCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateListCategory] on [__mj].[ListCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateListCategory]
ON [__mj].[ListCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ListCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Dashboard]'
GO
CREATE TABLE [__mj].[Dashboard]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Dashboard__NewID__51F21FC7] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [uniqueidentifier] NOT NULL,
[CategoryID] [uniqueidentifier] NULL,
[UIConfigDetails] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___1BFA9409] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dashboard____mj___1CEEB842] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Dashboard_ID] on [__mj].[Dashboard]'
GO
ALTER TABLE [__mj].[Dashboard] ADD CONSTRAINT [PK_Dashboard_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDashboard] on [__mj].[Dashboard]'
GO

CREATE TRIGGER [__mj].[trgUpdateDashboard]
ON [__mj].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Dashboard]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Dashboard] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationProviderMessageType]'
GO
CREATE TABLE [__mj].[CommunicationProviderMessageType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Communicati__ID___3B599E89] DEFAULT (newsequentialid()),
[CommunicationProviderID] [uniqueidentifier] NOT NULL,
[CommunicationBaseMessageTypeID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Communica__Statu__6F71D48B] DEFAULT ('Disabled'),
[AdditionalAttributes] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6FE707A1] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___70DB2BDA] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CommunicationProviderMessageType_ID] on [__mj].[CommunicationProviderMessageType]'
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] ADD CONSTRAINT [PK_CommunicationProviderMessageType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationProviderMessageType] on [__mj].[CommunicationProviderMessageType]'
GO

CREATE TRIGGER [__mj].[trgUpdateCommunicationProviderMessageType]
ON [__mj].[CommunicationProviderMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProviderMessageType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationProviderMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueueTask]'
GO
CREATE TABLE [__mj].[QueueTask]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__QueueTask__NewID__58F42311] DEFAULT (newsequentialid()),
[QueueID] [uniqueidentifier] NOT NULL,
[Status] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_QueueTask_Status] DEFAULT (N'Pending'),
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[Data] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Options] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Output] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueTask____mj___1A124B97] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueTask____mj___1B066FD0] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueueTask_ID] on [__mj].[QueueTask]'
GO
ALTER TABLE [__mj].[QueueTask] ADD CONSTRAINT [PK_QueueTask_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueueTask] on [__mj].[QueueTask]'
GO

CREATE TRIGGER [__mj].[trgUpdateQueueTask]
ON [__mj].[QueueTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueueTask]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[QueueTask] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIModelAction]'
GO
CREATE TABLE [__mj].[AIModelAction]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__AIModelAc__NewID__4FA9E4A2] DEFAULT (newsequentialid()),
[AIModelID] [uniqueidentifier] NOT NULL,
[AIActionID] [uniqueidentifier] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_AIModelAction_IsActive] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelAc____mj___127129CF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelAc____mj___13654E08] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModelAction_ID] on [__mj].[AIModelAction]'
GO
ALTER TABLE [__mj].[AIModelAction] ADD CONSTRAINT [PK_AIModelAction_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIModelAction] on [__mj].[AIModelAction]'
GO

CREATE TRIGGER [__mj].[trgUpdateAIModelAction]
ON [__mj].[AIModelAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIModelAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIAction]'
GO
CREATE TABLE [__mj].[AIAction]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__AIAction__ID___33B87CC1] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultModelID] [uniqueidentifier] NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_AIAction_IsActive] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIAction____mj_C__1088E15D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIAction____mj_U__117D0596] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIAction_ID] on [__mj].[AIAction]'
GO
ALTER TABLE [__mj].[AIAction] ADD CONSTRAINT [PK_AIAction_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIAction] on [__mj].[AIAction]'
GO

CREATE TRIGGER [__mj].[trgUpdateAIAction]
ON [__mj].[AIAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Workspace]'
GO
CREATE TABLE [__mj].[Workspace]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Workspace__ID___70C18B01] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2B3CD799] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2C30FBD2] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Workspace_ID] on [__mj].[Workspace]'
GO
ALTER TABLE [__mj].[Workspace] ADD CONSTRAINT [PK_Workspace_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkspace] on [__mj].[Workspace]'
GO

CREATE TRIGGER [__mj].[trgUpdateWorkspace]
ON [__mj].[Workspace]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workspace]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Workspace] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegrationRunDetail]'
GO
CREATE TABLE [__mj].[CompanyIntegrationRunDetail]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__CompanyInte__ID___401E53A6] DEFAULT (newsequentialid()),
[CompanyIntegrationRunID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Action] [nchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ExecutedAt] [datetime] NOT NULL CONSTRAINT [DF_CompanyIntegrationRunDetail_ExecutedAt] DEFAULT (getdate()),
[IsSuccess] [bit] NOT NULL CONSTRAINT [DF__CompanyIn__IsSuc__2AA05119] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___73ECA2AF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___74E0C6E8] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegrationRunDetail_ID] on [__mj].[CompanyIntegrationRunDetail]'
GO
ALTER TABLE [__mj].[CompanyIntegrationRunDetail] ADD CONSTRAINT [PK_CompanyIntegrationRunDetail_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRunDetail] on [__mj].[CompanyIntegrationRunDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegrationRunDetail]
ON [__mj].[CompanyIntegrationRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRunDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegrationRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[WorkspaceItem]'
GO
CREATE TABLE [__mj].[WorkspaceItem]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Workspace__NewID__307C1D63] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[WorkspaceID] [uniqueidentifier] NOT NULL,
[ResourceTypeID] [uniqueidentifier] NOT NULL,
[ResourceRecordID] [nvarchar] (2000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Sequence] [int] NOT NULL,
[Configuration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2D25200B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Workspace____mj___2E194444] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_WorkspaceItem_ID] on [__mj].[WorkspaceItem]'
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD CONSTRAINT [PK_WorkspaceItem_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkspaceItem] on [__mj].[WorkspaceItem]'
GO

CREATE TRIGGER [__mj].[trgUpdateWorkspaceItem]
ON [__mj].[WorkspaceItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkspaceItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[WorkspaceItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserRecordLog]'
GO
CREATE TABLE [__mj].[UserRecordLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserRecor__NewID__68F580B0] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EarliestAt] [datetime] NOT NULL CONSTRAINT [DF_UserRecordLog_EarliestAt] DEFAULT (getdate()),
[LatestAt] [datetime] NOT NULL CONSTRAINT [DF_UserRecordLog_LatestAt] DEFAULT (getdate()),
[TotalCount] [int] NOT NULL CONSTRAINT [DF_UserRecordLog_TotalCount] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserRecor____mj___701C11CB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserRecor____mj___71103604] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserRecordLog_ID] on [__mj].[UserRecordLog]'
GO
ALTER TABLE [__mj].[UserRecordLog] ADD CONSTRAINT [PK_UserRecordLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_UserRecordLog] on [__mj].[UserRecordLog]'
GO
CREATE NONCLUSTERED INDEX [IX_UserRecordLog] ON [__mj].[UserRecordLog] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserRecordLog] on [__mj].[UserRecordLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserRecordLog]
ON [__mj].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserRecordLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserRecordLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[flyway_schema_history]'
GO
CREATE TABLE [__mj].[flyway_schema_history]
(
[installed_rank] [int] NOT NULL,
[version] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[description] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[script] [nvarchar] (1000) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[checksum] [int] NULL,
[installed_by] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[installed_on] [datetime] NOT NULL CONSTRAINT [DF__flyway_sc__insta__304E3948] DEFAULT (getdate()),
[execution_time] [int] NOT NULL,
[success] [bit] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__flyway_sc____mj___31425D81] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__flyway_sc____mj___323681BA] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [flyway_schema_history_pk] on [__mj].[flyway_schema_history]'
GO
ALTER TABLE [__mj].[flyway_schema_history] ADD CONSTRAINT [flyway_schema_history_pk] PRIMARY KEY CLUSTERED ([installed_rank])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [flyway_schema_history_s_idx] on [__mj].[flyway_schema_history]'
GO
CREATE NONCLUSTERED INDEX [flyway_schema_history_s_idx] ON [__mj].[flyway_schema_history] ([success])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateflyway_schema_history] on [__mj].[flyway_schema_history]'
GO

CREATE TRIGGER [__mj].[trgUpdateflyway_schema_history]
ON [__mj].[flyway_schema_history]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[flyway_schema_history]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[flyway_schema_history] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[installed_rank] = I.[installed_rank];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityFieldValue]'
GO
CREATE TABLE [__mj].[EntityFieldValue]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_EntityFieldValue_ID_] DEFAULT (newsequentialid()),
[EntityFieldID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL,
[Value] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Code] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityFieldValue___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityFieldValue___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityFieldValue_1] on [__mj].[EntityFieldValue]'
GO
ALTER TABLE [__mj].[EntityFieldValue] ADD CONSTRAINT [PK_EntityFieldValue_1] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityFieldValue] on [__mj].[EntityFieldValue]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityFieldValue]
ON [__mj].[EntityFieldValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityFieldValue]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityFieldValue] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionContext]'
GO
CREATE TABLE [__mj].[ActionContext]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionCon__NewID__22D73E2B] DEFAULT (newsequentialid()),
[ActionID] [uniqueidentifier] NOT NULL,
[ContextTypeID] [uniqueidentifier] NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__ActionCon__Statu__12D7DEFD] DEFAULT ('Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___628D0C83] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionCon____mj___638130BC] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionContext_ID] on [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [PK_ActionContext_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionContext] on [__mj].[ActionContext]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionContext]
ON [__mj].[ActionContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContext]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionContext] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityRecordDocument]'
GO
CREATE TABLE [__mj].[EntityRecordDocument]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityRec__NewID__0819264E] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityDocumentID] [uniqueidentifier] NOT NULL,
[DocumentText] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[VectorIndexID] [uniqueidentifier] NOT NULL,
[VectorID] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[VectorJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityRecordUpdatedAt] [datetime] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRecordDocument___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRecordDocument___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityRecordDocument_ID] on [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [PK_EntityRecordDocument_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_EntityRecordDocument_RecordID] on [__mj].[EntityRecordDocument]'
GO
CREATE NONCLUSTERED INDEX [IX_EntityRecordDocument_RecordID] ON [__mj].[EntityRecordDocument] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityRecordDocument] on [__mj].[EntityRecordDocument]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityRecordDocument]
ON [__mj].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRecordDocument]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityRecordDocument] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionLibrary]'
GO
CREATE TABLE [__mj].[ActionLibrary]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionLibrar__ID__330DA5F4] DEFAULT (newsequentialid()),
[ActionID] [uniqueidentifier] NOT NULL,
[LibraryID] [uniqueidentifier] NOT NULL,
[ItemsUsed] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionLibrary___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ActionLibrary___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionLibrary_New_ID] on [__mj].[ActionLibrary]'
GO
ALTER TABLE [__mj].[ActionLibrary] ADD CONSTRAINT [PK_ActionLibrary_New_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionLibrary] on [__mj].[ActionLibrary]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionLibrary]
ON [__mj].[ActionLibrary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionLibrary]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionLibrary] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionExecutionLog]'
GO
CREATE TABLE [__mj].[ActionExecutionLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionExe__NewID__39BAA383] DEFAULT (newsequentialid()),
[ActionID] [uniqueidentifier] NOT NULL,
[StartedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionExe__Start__38FD87E5] DEFAULT (getdate()),
[EndedAt] [datetime] NULL,
[Params] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ResultCode] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [uniqueidentifier] NOT NULL,
[RetentionPeriod] [int] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionExe____mj___647554F5] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionExe____mj___6569792E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionExecutionLog_ID] on [__mj].[ActionExecutionLog]'
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD CONSTRAINT [PK_ActionExecutionLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionExecutionLog] on [__mj].[ActionExecutionLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionExecutionLog]
ON [__mj].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionExecutionLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionExecutionLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[FileStorageProvider]'
GO
CREATE TABLE [__mj].[FileStorageProvider]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__FileStorage__ID___5054BB6F] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ServerDriverKey] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ClientDriverKey] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Priority] [int] NOT NULL CONSTRAINT [DF_FileProvider_Priority] DEFAULT ((0)),
[IsActive] [bit] NOT NULL CONSTRAINT [DF_FileProvider_IsActive] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileStora____mj___4D91EF9D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileStora____mj___4E8613D6] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_FileStorageProvider_ID] on [__mj].[FileStorageProvider]'
GO
ALTER TABLE [__mj].[FileStorageProvider] ADD CONSTRAINT [PK_FileStorageProvider_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFileStorageProvider] on [__mj].[FileStorageProvider]'
GO

CREATE TRIGGER [__mj].[trgUpdateFileStorageProvider]
ON [__mj].[FileStorageProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileStorageProvider]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[FileStorageProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DuplicateRunDetail]'
GO
CREATE TABLE [__mj].[DuplicateRunDetail]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__DuplicateRu__ID___46CB5135] DEFAULT (newsequentialid()),
[DuplicateRunID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MatchStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetail_MatchStatus] DEFAULT (N'Pending'),
[SkippedReason] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[MatchErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[MergeStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetail_MergeStatus] DEFAULT (N'Not Applicable'),
[MergeErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___5AEBEABB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___5BE00EF4] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DuplicateRunDetail_ID] on [__mj].[DuplicateRunDetail]'
GO
ALTER TABLE [__mj].[DuplicateRunDetail] ADD CONSTRAINT [PK_DuplicateRunDetail_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDuplicateRunDetail] on [__mj].[DuplicateRunDetail]'
GO

CREATE TRIGGER [__mj].[trgUpdateDuplicateRunDetail]
ON [__mj].[DuplicateRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetail]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DuplicateRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntitySetting]'
GO
CREATE TABLE [__mj].[EntitySetting]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntitySet__NewID__2D4AAAFD] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntitySetting___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntitySetting___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntitySetting_ID] on [__mj].[EntitySetting]'
GO
ALTER TABLE [__mj].[EntitySetting] ADD CONSTRAINT [PK_EntitySetting_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntitySetting] on [__mj].[EntitySetting]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntitySetting]
ON [__mj].[EntitySetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntitySetting]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntitySetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Entity]'
GO
CREATE TABLE [__mj].[Entity]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF_Entity_ID_] DEFAULT (newsequentialid()),
[ParentID] [uniqueidentifier] NULL,
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
[DeleteType] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_Entity_DeleteType] DEFAULT (N'Hard'),
[AllowRecordMerge] [bit] NOT NULL CONSTRAINT [DF_Entity_AllowRecordMerge] DEFAULT ((0)),
[spMatch] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RelationshipDefaultDisplayType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Entity__Relation__0F008B9E] DEFAULT ('Search'),
[UserFormGenerated] [bit] NOT NULL CONSTRAINT [DF_Entity_UserFormGenerated] DEFAULT ((1)),
[EntityObjectSubclassName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityObjectSubclassImport] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[PreferredCommunicationField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Icon] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Entity___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Entity___mj_UpdatedAt] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateEntity] on [__mj].[Entity]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntity]
ON [__mj].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Entity]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Entity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[FileCategory]'
GO
CREATE TABLE [__mj].[FileCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__FileCategor__ID___4F609736] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [uniqueidentifier] NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileCateg____mj___51628081] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__FileCateg____mj___5256A4BA] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_FileCategory_ID] on [__mj].[FileCategory]'
GO
ALTER TABLE [__mj].[FileCategory] ADD CONSTRAINT [PK_FileCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFileCategory] on [__mj].[FileCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateFileCategory]
ON [__mj].[FileCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[FileCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityRelationship]'
GO
CREATE TABLE [__mj].[EntityRelationship]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityRel__NewID__184F8E17] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_EntityRelationship_Sequence] DEFAULT ((0)),
[RelatedEntityID] [uniqueidentifier] NOT NULL,
[BundleInAPI] [bit] NOT NULL CONSTRAINT [DF_admin.EntityRelationships_BundleInAPI] DEFAULT ((1)),
[IncludeInParentAllQuery] [bit] NOT NULL CONSTRAINT [DF_EntityRelationship_IncludeInParentAllQuery] DEFAULT ((0)),
[Type] [nchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityRelationship_Type] DEFAULT (N'One To Many'),
[EntityKeyField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RelatedEntityJoinField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[JoinView] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[JoinEntityJoinField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[JoinEntityInverseJoinField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayInForm] [bit] NOT NULL CONSTRAINT [DF_EntityRelationship_DisplayInForm] DEFAULT ((1)),
[DisplayLocation] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityRelationship_DisplayLocation] DEFAULT (N'After Field Tabs'),
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayIconType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityRelationship_DisplayIconType] DEFAULT (N'Related Entity Icon'),
[DisplayIcon] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayUserViewID] [uniqueidentifier] NULL,
[DisplayComponentID] [uniqueidentifier] NULL,
[DisplayComponentConfiguration] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRelationship___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityRelationship___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityRelationship_ID] on [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [PK_EntityRelationship_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityRelationship] on [__mj].[EntityRelationship]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityRelationship]
ON [__mj].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityRelationship] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[File]'
GO
CREATE TABLE [__mj].[File]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__File__ID___4E6C72FD] DEFAULT (newsequentialid()),
[Name] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [uniqueidentifier] NULL,
[ProviderID] [uniqueidentifier] NOT NULL,
[ContentType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ProviderKey] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_File_Status] DEFAULT (N'Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__File____mj_Creat__4F7A380F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__File____mj_Updat__506E5C48] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_File_ID] on [__mj].[File]'
GO
ALTER TABLE [__mj].[File] ADD CONSTRAINT [PK_File_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFile] on [__mj].[File]'
GO

CREATE TRIGGER [__mj].[trgUpdateFile]
ON [__mj].[File]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[File]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[File] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateCategory]'
GO
CREATE TABLE [__mj].[TemplateCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__TemplateCat__ID___673820C7] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___77882969] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___787C4DA2] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TemplateCategory_ID] on [__mj].[TemplateCategory]'
GO
ALTER TABLE [__mj].[TemplateCategory] ADD CONSTRAINT [PK_TemplateCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateCategory] on [__mj].[TemplateCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateTemplateCategory]
ON [__mj].[TemplateCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DuplicateRunDetailMatch]'
GO
CREATE TABLE [__mj].[DuplicateRunDetailMatch]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Duplicate__NewID__37FD439A] DEFAULT (newsequentialid()),
[DuplicateRunDetailID] [uniqueidentifier] NOT NULL,
[MatchSource] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MatchSource] DEFAULT (N'Vector'),
[MatchRecordID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MatchProbability] [numeric] (12, 11) NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MatchProbability] DEFAULT ((0)),
[MatchedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MatchedAt] DEFAULT (getdate()),
[Action] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_Action] DEFAULT (N'Ignore'),
[ApprovalStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_ApprovalStatus] DEFAULT (N'Pending'),
[RecordMergeLogID] [uniqueidentifier] NULL,
[MergeStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MergeStatus] DEFAULT (N'Pending'),
[MergedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MergedAt] DEFAULT (getdate()),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___571B59D7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___580F7E10] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DuplicateRunDetailMatch_ID] on [__mj].[DuplicateRunDetailMatch]'
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [PK_DuplicateRunDetailMatch_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDuplicateRunDetailMatch] on [__mj].[DuplicateRunDetailMatch]'
GO

CREATE TRIGGER [__mj].[trgUpdateDuplicateRunDetailMatch]
ON [__mj].[DuplicateRunDetailMatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetailMatch]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DuplicateRunDetailMatch] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Template]'
GO
CREATE TABLE [__mj].[Template]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Template__ID___6643FC8E] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [uniqueidentifier] NULL,
[UserPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [uniqueidentifier] NOT NULL,
[ActiveAt] [datetime] NULL,
[DisabledAt] [datetime] NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_Template_IsActive] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Template____mj_C__759FE0F7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Template____mj_U__76940530] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Template_ID] on [__mj].[Template]'
GO
ALTER TABLE [__mj].[Template] ADD CONSTRAINT [PK_Template_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplate] on [__mj].[Template]'
GO

CREATE TRIGGER [__mj].[trgUpdateTemplate]
ON [__mj].[Template]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Template]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Template] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityCommunicationMessageType]'
GO
CREATE TABLE [__mj].[EntityCommunicationMessageType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityCommu__ID___4A9BE219] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[BaseMessageTypeID] [uniqueidentifier] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__EntityCom__IsAct__36A5CD88] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationMessageType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityCommunicationMessageType___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityCommunicationMessageType_ID] on [__mj].[EntityCommunicationMessageType]'
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] ADD CONSTRAINT [PK_EntityCommunicationMessageType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityCommunicationMessageType] on [__mj].[EntityCommunicationMessageType]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityCommunicationMessageType]
ON [__mj].[EntityCommunicationMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationMessageType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityCommunicationMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionAuthorization]'
GO
CREATE TABLE [__mj].[ActionAuthorization]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ActionAut__NewID__194DD3F1] DEFAULT (newsequentialid()),
[ActionID] [uniqueidentifier] NOT NULL,
[AuthorizationID] [uniqueidentifier] NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionAut____mj___5CD4332D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ActionAut____mj___5DC85766] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionAuthorization_ID] on [__mj].[ActionAuthorization]'
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD CONSTRAINT [PK_ActionAuthorization_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionAuthorization] on [__mj].[ActionAuthorization]'
GO

CREATE TRIGGER [__mj].[trgUpdateActionAuthorization]
ON [__mj].[ActionAuthorization]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionAuthorization]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ActionAuthorization] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[LibraryItem]'
GO
CREATE TABLE [__mj].[LibraryItem]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__LibraryIt__NewID__20AFC9EE] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[LibraryID] [uniqueidentifier] NOT NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__LibraryIt____mj___08B2B56B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__LibraryIt____mj___09A6D9A4] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_LibraryItem_ID] on [__mj].[LibraryItem]'
GO
ALTER TABLE [__mj].[LibraryItem] ADD CONSTRAINT [PK_LibraryItem_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateLibraryItem] on [__mj].[LibraryItem]'
GO

CREATE TRIGGER [__mj].[trgUpdateLibraryItem]
ON [__mj].[LibraryItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[LibraryItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[LibraryItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionInvocation]'
GO
CREATE TABLE [__mj].[EntityActionInvocation]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityAct__NewID__7817C8AF] DEFAULT (newsequentialid()),
[EntityActionID] [uniqueidentifier] NOT NULL,
[InvocationTypeID] [uniqueidentifier] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__EntityAct__Statu__315C661D] DEFAULT ('Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocation___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityActionInvocation___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityActionInvocation_ID] on [__mj].[EntityActionInvocation]'
GO
ALTER TABLE [__mj].[EntityActionInvocation] ADD CONSTRAINT [PK_EntityActionInvocation_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionInvocation] on [__mj].[EntityActionInvocation]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityActionInvocation]
ON [__mj].[EntityActionInvocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocation]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityActionInvocation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityRelationshipDisplayComponent]'
GO
CREATE TABLE [__mj].[EntityRelationshipDisplayComponent]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityRelat__ID___4D784EC4] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RelationshipType] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityRel____mj___7282B1D3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EntityRel____mj___7376D60C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityRelationshipDisplayComponent_ID] on [__mj].[EntityRelationshipDisplayComponent]'
GO
ALTER TABLE [__mj].[EntityRelationshipDisplayComponent] ADD CONSTRAINT [PK_EntityRelationshipDisplayComponent_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationshipDisplayComponent]'
GO
ALTER TABLE [__mj].[EntityRelationshipDisplayComponent] ADD CONSTRAINT [UQ__EntityRe__737584F667950678] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityRelationshipDisplayComponent] on [__mj].[EntityRelationshipDisplayComponent]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityRelationshipDisplayComponent]
ON [__mj].[EntityRelationshipDisplayComponent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationshipDisplayComponent]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityRelationshipDisplayComponent] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CompanyIntegration]'
GO
CREATE TABLE [__mj].[CompanyIntegration]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__CompanyInte__ID___3E360B34] DEFAULT (newsequentialid()),
[CompanyID] [uniqueidentifier] NOT NULL,
[IntegrationID] [uniqueidentifier] NOT NULL,
[IsActive] [bit] NULL,
[AccessToken] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RefreshToken] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TokenExpirationDate] [datetime] NULL,
[APIKey] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ExternalSystemID] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsExternalSystemReadOnly] [bit] NOT NULL CONSTRAINT [DF__CompanyIn__IsExt__6A07746E] DEFAULT ((0)),
[ClientID] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ClientSecret] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CustomAttribute1] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___6E33C959] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__CompanyIn____mj___6F27ED92] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CompanyIntegration_ID] on [__mj].[CompanyIntegration]'
GO
ALTER TABLE [__mj].[CompanyIntegration] ADD CONSTRAINT [PK_CompanyIntegration_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegration] on [__mj].[CompanyIntegration]'
GO

CREATE TRIGGER [__mj].[trgUpdateCompanyIntegration]
ON [__mj].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegration]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CompanyIntegration] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Integration]'
GO
CREATE TABLE [__mj].[Integration]
(
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[NavigationBaseURL] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ClassName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ImportPath] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[BatchMaxRequestCount] [int] NOT NULL CONSTRAINT [DF__Integrati__Batch__522FEADD] DEFAULT ((-1)),
[BatchRequestWaitTime] [int] NOT NULL CONSTRAINT [DF__Integrati__Batch__53240F16] DEFAULT ((-1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6C4B80E7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6D3FA520] DEFAULT (getutcdate()),
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Integration__ID___5148DFA8] DEFAULT (newsequentialid())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Integration_ID] on [__mj].[Integration]'
GO
ALTER TABLE [__mj].[Integration] ADD CONSTRAINT [PK_Integration_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Integration]'
GO
ALTER TABLE [__mj].[Integration] ADD CONSTRAINT [UQ_Integration_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateIntegration] on [__mj].[Integration]'
GO

CREATE TRIGGER [__mj].[trgUpdateIntegration]
ON [__mj].[Integration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Integration]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Integration] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationRun]'
GO
CREATE TABLE [__mj].[CommunicationRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Communicati__ID___3C4DC2C2] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[Direction] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6DFEBF2F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6EF2E368] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CommunicationRun_ID] on [__mj].[CommunicationRun]'
GO
ALTER TABLE [__mj].[CommunicationRun] ADD CONSTRAINT [PK_CommunicationRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationRun] on [__mj].[CommunicationRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateCommunicationRun]
ON [__mj].[CommunicationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIModelType]'
GO
CREATE TABLE [__mj].[AIModelType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__AIModelType__ID___35A0C533] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelTy____mj___14597241] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModelTy____mj___154D967A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModelType_ID] on [__mj].[AIModelType]'
GO
ALTER TABLE [__mj].[AIModelType] ADD CONSTRAINT [PK_AIModelType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIModelType] on [__mj].[AIModelType]'
GO

CREATE TRIGGER [__mj].[trgUpdateAIModelType]
ON [__mj].[AIModelType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIModelType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Role]'
GO
CREATE TABLE [__mj].[Role]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Role__ID___62736BAA] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DirectoryID] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SQLName] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Role___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Role___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Role_ID] on [__mj].[Role]'
GO
ALTER TABLE [__mj].[Role] ADD CONSTRAINT [PK_Role_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Role]'
GO
ALTER TABLE [__mj].[Role] ADD CONSTRAINT [UQ__Role__737584F6A210197E] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRole] on [__mj].[Role]'
GO

CREATE TRIGGER [__mj].[trgUpdateRole]
ON [__mj].[Role]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Role]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Role] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Queue]'
GO
CREATE TABLE [__mj].[Queue]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Queue__ID___58EA0170] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[QueueTypeID] [uniqueidentifier] NOT NULL,
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
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Queue____mj_Crea__182A0325] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Queue____mj_Upda__191E275E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Queue_ID] on [__mj].[Queue]'
GO
ALTER TABLE [__mj].[Queue] ADD CONSTRAINT [PK_Queue_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueue] on [__mj].[Queue]'
GO

CREATE TRIGGER [__mj].[trgUpdateQueue]
ON [__mj].[Queue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Queue]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[Queue] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationLog]'
GO
CREATE TABLE [__mj].[CommunicationLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Communica__NewID__62B29775] DEFAULT (newsequentialid()),
[CommunicationProviderID] [uniqueidentifier] NOT NULL,
[CommunicationProviderMessageTypeID] [uniqueidentifier] NOT NULL,
[CommunicationRunID] [uniqueidentifier] NULL,
[Direction] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MessageDate] [datetime] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_CommunicationLog_Status] DEFAULT (N'Pending'),
[MessageContent] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___71CF5013] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___72C3744C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CommunicationLog_ID] on [__mj].[CommunicationLog]'
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [PK_CommunicationLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationLog] on [__mj].[CommunicationLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateCommunicationLog]
ON [__mj].[CommunicationLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[IntegrationURLFormat]'
GO
CREATE TABLE [__mj].[IntegrationURLFormat]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Integrati__NewID__17265FB4] DEFAULT (newsequentialid()),
[IntegrationID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[URLFormat] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6A633875] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Integrati____mj___6B575CAE] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_IntegrationURLFormat_ID] on [__mj].[IntegrationURLFormat]'
GO
ALTER TABLE [__mj].[IntegrationURLFormat] ADD CONSTRAINT [PK_IntegrationURLFormat_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateIntegrationURLFormat] on [__mj].[IntegrationURLFormat]'
GO

CREATE TRIGGER [__mj].[trgUpdateIntegrationURLFormat]
ON [__mj].[IntegrationURLFormat]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[IntegrationURLFormat]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[IntegrationURLFormat] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationProvider]'
GO
CREATE TABLE [__mj].[CommunicationProvider]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Communicati__ID___3A657A50] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Communica__Statu__602F90FB] DEFAULT ('Disabled'),
[SupportsSending] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__6217D96D] DEFAULT ((1)),
[SupportsReceiving] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__630BFDA6] DEFAULT ((0)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6C1676BD] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Communica____mj___6D0A9AF6] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_CommunicationProvider_ID] on [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] ADD CONSTRAINT [PK_CommunicationProvider_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] ADD CONSTRAINT [UQ_CommunicationProvider_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationProvider] on [__mj].[CommunicationProvider]'
GO

CREATE TRIGGER [__mj].[trgUpdateCommunicationProvider]
ON [__mj].[CommunicationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProvider]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[CommunicationProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[WorkflowEngine]'
GO
CREATE TABLE [__mj].[WorkflowEngine]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__WorkflowEng__ID___6FCD66C8] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverPath] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DriverClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowE____mj___08E7BF95] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__WorkflowE____mj___09DBE3CE] DEFAULT (getutcdate())
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
PRINT N'Creating trigger [__mj].[trgUpdateWorkflowEngine] on [__mj].[WorkflowEngine]'
GO

CREATE TRIGGER [__mj].[trgUpdateWorkflowEngine]
ON [__mj].[WorkflowEngine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowEngine]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[WorkflowEngine] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocumentRun]'
GO
CREATE TABLE [__mj].[EntityDocumentRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityDoc__NewID__53A55E0F] DEFAULT (newsequentialid()),
[EntityDocumentID] [uniqueidentifier] NOT NULL,
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityDocumentRun_Status] DEFAULT (N'Pending'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentRun___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityDocumentRun___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocumentRun_ID] on [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD CONSTRAINT [PK_EntityDocumentRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocumentRun] on [__mj].[EntityDocumentRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityDocumentRun]
ON [__mj].[EntityDocumentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityDocumentRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AIModel]'
GO
CREATE TABLE [__mj].[AIModel]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__AIModel__ID___34ACA0FA] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Vendor] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[AIModelTypeID] [uniqueidentifier] NOT NULL,
[PowerRank] [int] NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_AIModel_IsActive] DEFAULT ((1)),
[DriverClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverImportPath] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[APIName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModel____mj_Cr__0EA098EB] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__AIModel____mj_Up__0F94BD24] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AIModel_ID] on [__mj].[AIModel]'
GO
ALTER TABLE [__mj].[AIModel] ADD CONSTRAINT [PK_AIModel_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIModel] on [__mj].[AIModel]'
GO

CREATE TRIGGER [__mj].[trgUpdateAIModel]
ON [__mj].[AIModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModel]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[AIModel] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ExplorerNavigationItem]'
GO
CREATE TABLE [__mj].[ExplorerNavigationItem]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ExplorerNavi__ID__02D946F7] DEFAULT (newsequentialid()),
[Sequence] [int] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Route] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__ExplorerN__IsAct__750028EC] DEFAULT ((1)),
[ShowInHomeScreen] [bit] NOT NULL CONSTRAINT [DF_ExplorerNavigationItem_ShowOnHomeScreen] DEFAULT ((0)),
[ShowInNavigationDrawer] [bit] NOT NULL CONSTRAINT [DF_ExplorerNavigationItem_ShowOnNavigationDrawer] DEFAULT ((0)),
[IconCSSClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ExplorerN____mj___7F92C5F8] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ExplorerN____mj___0086EA31] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Explorer__3214EC271BB186EE] on [__mj].[ExplorerNavigationItem]'
GO
ALTER TABLE [__mj].[ExplorerNavigationItem] ADD CONSTRAINT [PK__Explorer__3214EC271BB186EE] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ExplorerNavigationItem]'
GO
ALTER TABLE [__mj].[ExplorerNavigationItem] ADD CONSTRAINT [UQ_ExplorerNavigationItem_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ExplorerNavigationItem]'
GO
ALTER TABLE [__mj].[ExplorerNavigationItem] ADD CONSTRAINT [UQ_ExplorerNavigationItem_Route] UNIQUE NONCLUSTERED ([Route])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateExplorerNavigationItem] on [__mj].[ExplorerNavigationItem]'
GO

CREATE TRIGGER [__mj].[trgUpdateExplorerNavigationItem]
ON [__mj].[ExplorerNavigationItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ExplorerNavigationItem]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ExplorerNavigationItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserViewCategory]'
GO
CREATE TABLE [__mj].[UserViewCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserViewCat__ID___6BFCD5E4] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewC____mj___47D91647] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__UserViewC____mj___48CD3A80] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserViewCategory_ID] on [__mj].[UserViewCategory]'
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [PK_UserViewCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserViewCategory] on [__mj].[UserViewCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateUserViewCategory]
ON [__mj].[UserViewCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[UserViewCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DataContext]'
GO
CREATE TABLE [__mj].[DataContext]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__DataContext__ID___43EEE48A] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [uniqueidentifier] NOT NULL,
[LastRefreshedAt] [datetime] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___45F0CDD5] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DataConte____mj___46E4F20E] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DataContext_ID] on [__mj].[DataContext]'
GO
ALTER TABLE [__mj].[DataContext] ADD CONSTRAINT [PK_DataContext_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDataContext] on [__mj].[DataContext]'
GO

CREATE TRIGGER [__mj].[trgUpdateDataContext]
ON [__mj].[DataContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContext]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DataContext] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ReportCategory]'
GO
CREATE TABLE [__mj].[ReportCategory]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ReportCateg__ID___608B2338] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[UserID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportCat____mj___4BA9A72B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ReportCat____mj___4C9DCB64] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ReportCategory_ID] on [__mj].[ReportCategory]'
GO
ALTER TABLE [__mj].[ReportCategory] ADD CONSTRAINT [PK_ReportCategory_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateReportCategory] on [__mj].[ReportCategory]'
GO

CREATE TRIGGER [__mj].[trgUpdateReportCategory]
ON [__mj].[ReportCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportCategory]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ReportCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ErrorLog]'
GO
CREATE TABLE [__mj].[ErrorLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ErrorLog__NewID__35DFF0FE] DEFAULT (newsequentialid()),
[CompanyIntegrationRunID] [uniqueidentifier] NULL,
[CompanyIntegrationRunDetailID] [uniqueidentifier] NULL,
[Code] [nchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Message] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedBy] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL CONSTRAINT [DF_ErrorLog_CreatedBy] DEFAULT (suser_name()),
[Status] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Category] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Details] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ErrorLog____mj_C__75D4EB21] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__ErrorLog____mj_U__76C90F5A] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ErrorLog_ID] on [__mj].[ErrorLog]'
GO
ALTER TABLE [__mj].[ErrorLog] ADD CONSTRAINT [PK_ErrorLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateErrorLog] on [__mj].[ErrorLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateErrorLog]
ON [__mj].[ErrorLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ErrorLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ErrorLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateContentType]'
GO
CREATE TABLE [__mj].[TemplateContentType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__TemplateCon__ID___682C4500] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeType] [nvarchar] (25) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_TemplateContentType_CodeType] DEFAULT (N'Other'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___7D4102BF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TemplateC____mj___7E3526F8] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TemplateContentType_ID] on [__mj].[TemplateContentType]'
GO
ALTER TABLE [__mj].[TemplateContentType] ADD CONSTRAINT [PK_TemplateContentType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateContentType] on [__mj].[TemplateContentType]'
GO

CREATE TRIGGER [__mj].[trgUpdateTemplateContentType]
ON [__mj].[TemplateContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContentType]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[TemplateContentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ApplicationSetting]'
GO
CREATE TABLE [__mj].[ApplicationSetting]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Applicati__NewID__18849841] DEFAULT (newsequentialid()),
[ApplicationID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationSetting___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ApplicationSetting___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ApplicationSetting_ID] on [__mj].[ApplicationSetting]'
GO
ALTER TABLE [__mj].[ApplicationSetting] ADD CONSTRAINT [PK_ApplicationSetting_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateApplicationSetting] on [__mj].[ApplicationSetting]'
GO

CREATE TRIGGER [__mj].[trgUpdateApplicationSetting]
ON [__mj].[ApplicationSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationSetting]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[ApplicationSetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecommendationProvider]'
GO
CREATE TABLE [__mj].[RecommendationProvider]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Recommendat__ID___5BC66E1B] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___011193A3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Recommend____mj___0205B7DC] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecommendationProvider_ID] on [__mj].[RecommendationProvider]'
GO
ALTER TABLE [__mj].[RecommendationProvider] ADD CONSTRAINT [PK_RecommendationProvider_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendationProvider] on [__mj].[RecommendationProvider]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecommendationProvider]
ON [__mj].[RecommendationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationProvider]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecommendationProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DuplicateRun]'
GO
CREATE TABLE [__mj].[DuplicateRun]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__DuplicateRu__ID___45D72CFC] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[StartedByUserID] [uniqueidentifier] NOT NULL,
[SourceListID] [uniqueidentifier] NOT NULL,
[StartedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRun_StartedAt] DEFAULT (getdate()),
[EndedAt] [datetime] NULL,
[ApprovalStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRun_ApprovalStatus] DEFAULT (N'Pending'),
[ApprovalComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ApprovedByUserID] [uniqueidentifier] NULL,
[ProcessingStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRun_ProcessingStatus] DEFAULT (N'Pending'),
[ProcessingErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___5903A249] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Duplicate____mj___59F7C682] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DuplicateRun_ID] on [__mj].[DuplicateRun]'
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [PK_DuplicateRun_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDuplicateRun] on [__mj].[DuplicateRun]'
GO

CREATE TRIGGER [__mj].[trgUpdateDuplicateRun]
ON [__mj].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRun]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[DuplicateRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordMergeLog]'
GO
CREATE TABLE [__mj].[RecordMergeLog]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__RecordMerge__ID___5EA2DAC6] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[SurvivingRecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[InitiatedByUserID] [uniqueidentifier] NOT NULL,
[ApprovalStatus] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordMergeLog_ApprovalStatus] DEFAULT (N'Pending'),
[ApprovedByUserID] [uniqueidentifier] NULL,
[ProcessingStatus] [nvarchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordMergeLog_Status] DEFAULT (N'Pending'),
[ProcessingStartedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordMergeLog_StartedAt] DEFAULT (getdate()),
[ProcessingEndedAt] [datetime] NULL,
[ProcessingLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3C67639B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__RecordMer____mj___3D5B87D4] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordMergeLog_ID] on [__mj].[RecordMergeLog]'
GO
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [PK_RecordMergeLog_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_RecordMergeLog] on [__mj].[RecordMergeLog]'
GO
CREATE NONCLUSTERED INDEX [IX_RecordMergeLog] ON [__mj].[RecordMergeLog] ([SurvivingRecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecordMergeLog] on [__mj].[RecordMergeLog]'
GO

CREATE TRIGGER [__mj].[trgUpdateRecordMergeLog]
ON [__mj].[RecordMergeLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeLog]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[RecordMergeLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[SchemaInfo]'
GO
CREATE TABLE [__mj].[SchemaInfo]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__SchemaInf__NewID__1AC1E66E] DEFAULT (newsequentialid()),
[SchemaName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityIDMin] [int] NOT NULL,
[EntityIDMax] [int] NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__SchemaInf____mj___3896D2B7] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__SchemaInf____mj___398AF6F0] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_SchemaInfo_ID] on [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] ADD CONSTRAINT [PK_SchemaInfo_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[SchemaInfo]'
GO
ALTER TABLE [__mj].[SchemaInfo] ADD CONSTRAINT [IX_SchemaInfo] UNIQUE NONCLUSTERED ([SchemaName])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateSchemaInfo] on [__mj].[SchemaInfo]'
GO

CREATE TRIGGER [__mj].[trgUpdateSchemaInfo]
ON [__mj].[SchemaInfo]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[SchemaInfo]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[SchemaInfo] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityAIAction]'
GO
CREATE TABLE [__mj].[EntityAIAction]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EntityAIA__NewID__77E2BE85] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[AIModelID] [uniqueidentifier] NOT NULL,
[AIActionID] [uniqueidentifier] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Prompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TriggerEvent] [nchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityAIAction_ExecutionTiming] DEFAULT (N'After Save'),
[UserMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[OutputType] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityAIAction_OutputRoute] DEFAULT (N'FIeld'),
[OutputField] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SkipIfOutputFieldNotEmpty] [bit] NOT NULL CONSTRAINT [DF_EntityAIAction_SkipIfOutputFieldNotEmpty] DEFAULT ((1)),
[OutputEntityID] [uniqueidentifier] NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAIAction___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EntityAIAction___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityAIAction_ID] on [__mj].[EntityAIAction]'
GO
ALTER TABLE [__mj].[EntityAIAction] ADD CONSTRAINT [PK_EntityAIAction_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityAIAction] on [__mj].[EntityAIAction]'
GO

CREATE TRIGGER [__mj].[trgUpdateEntityAIAction]
ON [__mj].[EntityAIAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAIAction]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EntityAIAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EmployeeCompanyIntegration]'
GO
CREATE TABLE [__mj].[EmployeeCompanyIntegration]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EmployeeC__NewID__700C9293] DEFAULT (newsequentialid()),
[EmployeeID] [uniqueidentifier] NOT NULL,
[CompanyIntegrationID] [uniqueidentifier] NOT NULL,
[ExternalSystemRecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__EmployeeC__IsAct__09FE775D] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EmployeeC____mj___6692A791] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__EmployeeC____mj___6786CBCA] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EmployeeCompanyIntegration_ID] on [__mj].[EmployeeCompanyIntegration]'
GO
ALTER TABLE [__mj].[EmployeeCompanyIntegration] ADD CONSTRAINT [PK_EmployeeCompanyIntegration_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployeeCompanyIntegration] on [__mj].[EmployeeCompanyIntegration]'
GO

CREATE TRIGGER [__mj].[trgUpdateEmployeeCompanyIntegration]
ON [__mj].[EmployeeCompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeCompanyIntegration]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EmployeeCompanyIntegration] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EmployeeRole]'
GO
CREATE TABLE [__mj].[EmployeeRole]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__EmployeeR__NewID__7A8A2106] DEFAULT (newsequentialid()),
[EmployeeID] [uniqueidentifier] NOT NULL,
[RoleID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeRole___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_EmployeeRole___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EmployeeRole_ID] on [__mj].[EmployeeRole]'
GO
ALTER TABLE [__mj].[EmployeeRole] ADD CONSTRAINT [PK_EmployeeRole_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployeeRole] on [__mj].[EmployeeRole]'
GO

CREATE TRIGGER [__mj].[trgUpdateEmployeeRole]
ON [__mj].[EmployeeRole]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeRole]
    SET 
        __mj_UpdatedAt = GETUTCDATE()
    FROM 
        [__mj].[EmployeeRole] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[OutputDeliveryType]'
GO
CREATE TABLE [__mj].[OutputDeliveryType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__OutputDeliv__ID___54254C53] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputDel____mj___21B36D5F] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputDel____mj___22A79198] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputDeliveryType_ID] on [__mj].[OutputDeliveryType]'
GO
ALTER TABLE [__mj].[OutputDeliveryType] ADD CONSTRAINT [PK_OutputDeliveryType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[OutputFormatType]'
GO
CREATE TABLE [__mj].[OutputFormatType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__OutputForma__ID___5519708C] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplayFormat] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputFor____mj___1FCB24ED] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputFor____mj___20BF4926] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputFormatType_ID] on [__mj].[OutputFormatType]'
GO
ALTER TABLE [__mj].[OutputFormatType] ADD CONSTRAINT [PK_OutputFormatType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[OutputTriggerType]'
GO
CREATE TABLE [__mj].[OutputTriggerType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__OutputTrigg__ID___560D94C5] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputTri____mj___1DE2DC7B] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__OutputTri____mj___1ED700B4] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_OutputTriggerType_ID] on [__mj].[OutputTriggerType]'
GO
ALTER TABLE [__mj].[OutputTriggerType] ADD CONSTRAINT [PK_OutputTriggerType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ResourceType]'
GO
CREATE TABLE [__mj].[ResourceType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__ResourceTyp__ID___617F4771] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Icon] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[EntityID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ResourceType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_ResourceType___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ResourceType_ID] on [__mj].[ResourceType]'
GO
ALTER TABLE [__mj].[ResourceType] ADD CONSTRAINT [PK_ResourceType_ID] PRIMARY KEY CLUSTERED ([ID])
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
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Tag__ID___654FD855] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [uniqueidentifier] NULL,
[DisplayName] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Tag____mj_Create__276C46B5] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Tag____mj_Update__28606AEE] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Tag_ID] on [__mj].[Tag]'
GO
ALTER TABLE [__mj].[Tag] ADD CONSTRAINT [PK_Tag_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TaggedItem]'
GO
CREATE TABLE [__mj].[TaggedItem]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__TaggedIte__NewID__2AF84E37] DEFAULT (newsequentialid()),
[TagID] [uniqueidentifier] NOT NULL,
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TaggedIte____mj___29548F27] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__TaggedIte____mj___2A48B360] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_TaggedItem_ID] on [__mj].[TaggedItem]'
GO
ALTER TABLE [__mj].[TaggedItem] ADD CONSTRAINT [PK_TaggedItem_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_TaggedItem_RecordID] on [__mj].[TaggedItem]'
GO
CREATE NONCLUSTERED INDEX [IX_TaggedItem_RecordID] ON [__mj].[TaggedItem] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Authorization]'
GO
CREATE TABLE [__mj].[Authorization]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Authorizati__ID___387D31DE] DEFAULT (newsequentialid()),
[ParentID] [uniqueidentifier] NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_Authorization_IsActive] DEFAULT ((1)),
[UseAuditLog] [bit] NOT NULL CONSTRAINT [DF_Authorization_UseAuditLog] DEFAULT ((1)),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Authorization___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_Authorization___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Authorization_ID] on [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] ADD CONSTRAINT [PK_Authorization_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] ADD CONSTRAINT [UQ_Authorization] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AuditLogType]'
GO
CREATE TABLE [__mj].[AuditLogType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__AuditLogTyp__ID___37890DA5] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [uniqueidentifier] NULL,
[AuthorizationID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_AuditLogType___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_AuditLogType___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AuditLogType_ID] on [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [PK_AuditLogType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [UQ_AuditLogType] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[AuthorizationRole]'
GO
CREATE TABLE [__mj].[AuthorizationRole]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Authoriza__NewID__2119DE42] DEFAULT (newsequentialid()),
[AuthorizationID] [uniqueidentifier] NOT NULL,
[RoleID] [uniqueidentifier] NOT NULL,
[Type] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_AuthorizationRole_Type] DEFAULT (N'grant'),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Authoriza____mj___0CB85079] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Authoriza____mj___0DAC74B2] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_AuthorizationRole_ID] on [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [PK_AuthorizationRole_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Dataset]'
GO
CREATE TABLE [__mj].[Dataset]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Dataset__ID___44E308C3] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dataset____mj_Cr__2F0D687D] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Dataset____mj_Up__30018CB6] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Dataset_ID] on [__mj].[Dataset]'
GO
ALTER TABLE [__mj].[Dataset] ADD CONSTRAINT [PK_Dataset_ID] PRIMARY KEY CLUSTERED ([ID])
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
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__DatasetIt__NewID__5B7B8A01] DEFAULT (newsequentialid()),
[Code] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DatasetID] [uniqueidentifier] NOT NULL,
[Sequence] [int] NOT NULL CONSTRAINT [DF_DatasetItem_Sequence] DEFAULT ((0)),
[EntityID] [uniqueidentifier] NOT NULL,
[WhereClause] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DateFieldToCheck] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DatasetIt____mj___30F5B0EF] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__DatasetIt____mj___31E9D528] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DatasetItem_ID] on [__mj].[DatasetItem]'
GO
ALTER TABLE [__mj].[DatasetItem] ADD CONSTRAINT [PK_DatasetItem_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Skill]'
GO
CREATE TABLE [__mj].[Skill]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__Skill__ID___645BB41C] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [uniqueidentifier] NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Skill____mj_Crea__687AF003] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__Skill____mj_Upda__696F143C] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_Skill_ID] on [__mj].[Skill]'
GO
ALTER TABLE [__mj].[Skill] ADD CONSTRAINT [PK_Skill_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RowLevelSecurityFilter]'
GO
CREATE TABLE [__mj].[RowLevelSecurityFilter]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__RowLevelSec__ID___63678FE3] DEFAULT (newsequentialid()),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[FilterText] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RowLevelSecurityFilter___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RowLevelSecurityFilter___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RowLevelSecurityFilter_ID] on [__mj].[RowLevelSecurityFilter]'
GO
ALTER TABLE [__mj].[RowLevelSecurityFilter] ADD CONSTRAINT [PK_RowLevelSecurityFilter_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[QueueType]'
GO
CREATE TABLE [__mj].[QueueType]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__QueueType__ID___59DE25A9] DEFAULT (newsequentialid()),
[Name] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DriverClass] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DriverImportPath] [nvarchar] (200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_QueueType_IsActive] DEFAULT ((1)),
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueType____mj___1641BAB3] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF__QueueType____mj___1735DEEC] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_QueueType_ID] on [__mj].[QueueType]'
GO
ALTER TABLE [__mj].[QueueType] ADD CONSTRAINT [PK_QueueType_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecordChange]'
GO
CREATE TABLE [__mj].[RecordChange]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__RecordCha__NewID__6DEF3FF7] DEFAULT (newsequentialid()),
[EntityID] [uniqueidentifier] NOT NULL,
[RecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserID] [uniqueidentifier] NOT NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordChange_Type] DEFAULT (N'Create'),
[Source] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordChange_Source] DEFAULT (N'Internal'),
[ChangedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RecordChange_ChangedAt] DEFAULT (getutcdate()),
[ChangesJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ChangesDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[FullRecordJSON] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordChange_Status] DEFAULT (N'Complete'),
[ErrorLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ReplayRunID] [uniqueidentifier] NULL,
[IntegrationID] [uniqueidentifier] NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RecordChange_CreatedAt] DEFAULT (getutcdate()),
[UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_RecordChange_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_RecordChange_ID] on [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [PK_RecordChange_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_RecordChange_RecordID] on [__mj].[RecordChange]'
GO
CREATE NONCLUSTERED INDEX [IX_RecordChange_RecordID] ON [__mj].[RecordChange] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[SystemEvent]'
GO
CREATE TABLE [__mj].[SystemEvent]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__SystemEve__NewID__253F74E1] DEFAULT (newsequentialid()),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityID] [uniqueidentifier] NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_SystemEvent_ID] on [__mj].[SystemEvent]'
GO
ALTER TABLE [__mj].[SystemEvent] ADD CONSTRAINT [PK_SystemEvent_ID] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[UserRole]'
GO
CREATE TABLE [__mj].[UserRole]
(
[ID] [uniqueidentifier] NOT NULL CONSTRAINT [DF__UserRole__NewID__7FD8E608] DEFAULT (newsequentialid()),
[UserID] [uniqueidentifier] NOT NULL,
[RoleID] [uniqueidentifier] NOT NULL,
[__mj_CreatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserRole___mj_CreatedAt] DEFAULT (getutcdate()),
[__mj_UpdatedAt] [datetimeoffset] NOT NULL CONSTRAINT [DF___mj_UserRole___mj_UpdatedAt] DEFAULT (getutcdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_UserRole_ID] on [__mj].[UserRole]'
GO
ALTER TABLE [__mj].[UserRole] ADD CONSTRAINT [PK_UserRole_ID] PRIMARY KEY CLUSTERED ([ID])
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
PRINT N'Creating [__mj].[vwScheduledActions]'
GO


CREATE VIEW [__mj].[vwScheduledActions]
AS
SELECT 
    s.*
FROM
    [__mj].[ScheduledAction] AS s
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateScheduledAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateScheduledAction]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CreatedByUserID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Type nvarchar(20),
    @CronExpression nvarchar(100),
    @Timezone nvarchar(100),
    @Status nvarchar(20),
    @IntervalDays int,
    @DayOfWeek nvarchar(20),
    @DayOfMonth int,
    @Month nvarchar(20),
    @CustomCronExpression nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ScheduledAction]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CreatedByUserID] = @CreatedByUserID,
        [ActionID] = @ActionID,
        [Type] = @Type,
        [CronExpression] = @CronExpression,
        [Timezone] = @Timezone,
        [Status] = @Status,
        [IntervalDays] = @IntervalDays,
        [DayOfWeek] = @DayOfWeek,
        [DayOfMonth] = @DayOfMonth,
        [Month] = @Month,
        [CustomCronExpression] = @CustomCronExpression
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwScheduledActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionContexts]'
GO


CREATE VIEW [__mj].[vwActionContexts]
AS
SELECT 
    a.*,
    Action_ActionID.[Name] AS [Action],
    ActionContextType_ContextTypeID.[Name] AS [ContextType]
FROM
    [__mj].[ActionContext] AS a
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
LEFT OUTER JOIN
    [__mj].[ActionContextType] AS ActionContextType_ContextTypeID
  ON
    [a].[ContextTypeID] = ActionContextType_ContextTypeID.[ID]
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
PRINT N'Creating [__mj].[vwScheduledActionParams]'
GO


CREATE VIEW [__mj].[vwScheduledActionParams]
AS
SELECT 
    s.*
FROM
    [__mj].[ScheduledActionParam] AS s
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateScheduledActionParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateScheduledActionParam]
    @ID uniqueidentifier,
    @ScheduledActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ScheduledActionParam]
    SET 
        [ScheduledActionID] = @ScheduledActionID,
        [ActionParamID] = @ActionParamID,
        [ValueType] = @ValueType,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwScheduledActionParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionExecutionLogs]'
GO


CREATE VIEW [__mj].[vwActionExecutionLogs]
AS
SELECT 
    a.*,
    Action_ActionID.[Name] AS [Action],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[ActionExecutionLog] AS a
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
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
PRINT N'Creating [__mj].[vwExplorerNavigationItems]'
GO


CREATE VIEW [__mj].[vwExplorerNavigationItems]
AS
SELECT 
    e.*
FROM
    [__mj].[ExplorerNavigationItem] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateExplorerNavigationItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateExplorerNavigationItem]
    @ID uniqueidentifier,
    @Sequence int,
    @Name nvarchar(100),
    @Route nvarchar(255),
    @IsActive bit,
    @ShowInHomeScreen bit,
    @ShowInNavigationDrawer bit,
    @IconCSSClass nvarchar(100),
    @Description nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ExplorerNavigationItem]
    SET 
        [Sequence] = @Sequence,
        [Name] = @Name,
        [Route] = @Route,
        [IsActive] = @IsActive,
        [ShowInHomeScreen] = @ShowInHomeScreen,
        [ShowInNavigationDrawer] = @ShowInNavigationDrawer,
        [IconCSSClass] = @IconCSSClass,
        [Description] = @Description,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwExplorerNavigationItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionParams]'
GO


CREATE VIEW [__mj].[vwActionParams]
AS
SELECT 
    a.*,
    Action_ActionID.[Name] AS [Action]
FROM
    [__mj].[ActionParam] AS a
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
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
PRINT N'Creating [__mj].[spCreateEntityDocumentRun]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocumentRun]
    @EntityDocumentID uniqueidentifier,
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityDocumentRun]
        (
            [EntityDocumentID],
            [StartedAt],
            [EndedAt],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityDocumentID,
            @StartedAt,
            @EndedAt,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[vwActionLibraries]'
GO


CREATE VIEW [__mj].[vwActionLibraries]
AS
SELECT 
    a.*,
    Action_ActionID.[Name] AS [Action],
    Library_LibraryID.[Name] AS [Library]
FROM
    [__mj].[ActionLibrary] AS a
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
INNER JOIN
    [__mj].[Library] AS Library_LibraryID
  ON
    [a].[LibraryID] = Library_LibraryID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityDocuments]'
GO


CREATE VIEW [__mj].[vwEntityDocuments]
AS
SELECT 
    e.*,
    EntityDocumentType_TypeID.[Name] AS [Type],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[EntityDocument] AS e
INNER JOIN
    [__mj].[EntityDocumentType] AS EntityDocumentType_TypeID
  ON
    [e].[TypeID] = EntityDocumentType_TypeID.[ID]
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityDocument]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocument]
    @Name nvarchar(250),
    @TypeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @VectorDatabaseID uniqueidentifier,
    @Status nvarchar(15),
    @TemplateID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityDocument]
        (
            [Name],
            [TypeID],
            [EntityID],
            [VectorDatabaseID],
            [Status],
            [TemplateID],
            [AIModelID],
            [PotentialMatchThreshold],
            [AbsoluteMatchThreshold]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @TypeID,
            @EntityID,
            @VectorDatabaseID,
            @Status,
            @TemplateID,
            @AIModelID,
            @PotentialMatchThreshold,
            @AbsoluteMatchThreshold
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAuditLog]'
GO


CREATE PROCEDURE [__mj].[spCreateAuditLog]
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[AuditLog]
        (
            [UserID],
            [AuditLogTypeID],
            [AuthorizationID],
            [Status],
            [Description],
            [Details],
            [EntityID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @AuditLogTypeID,
            @AuthorizationID,
            @Status,
            @Description,
            @Details,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAuditLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwLibraries]'
GO


CREATE VIEW [__mj].[vwLibraries]
AS
SELECT 
    l.*
FROM
    [__mj].[Library] AS l
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[VectorDatabase]
        (
            [Name],
            [Description],
            [DefaultURL],
            [ClassKey]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @DefaultURL,
            @ClassKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwVectorDatabases] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAuditLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateAuditLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AuditLog]
    SET 
        [UserID] = @UserID,
        [AuditLogTypeID] = @AuditLogTypeID,
        [AuthorizationID] = @AuthorizationID,
        [Status] = @Status,
        [Description] = @Description,
        [Details] = @Details,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAuditLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionParam]'
GO


CREATE PROCEDURE [__mj].[spCreateActionParam]
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit,
    @Description nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionParam]
        (
            [ActionID],
            [Name],
            [DefaultValue],
            [Type],
            [ValueType],
            [IsArray],
            [Description],
            [IsRequired]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @Name,
            @DefaultValue,
            @Type,
            @ValueType,
            @IsArray,
            @Description,
            @IsRequired
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDataContextItem]'
GO


CREATE PROCEDURE [__mj].[spCreateDataContextItem]
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwDataContextItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionContext]'
GO


CREATE PROCEDURE [__mj].[spCreateActionContext]
    @ActionID uniqueidentifier,
    @ContextTypeID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionContext]
        (
            [ActionID],
            [ContextTypeID],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @ContextTypeID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionContexts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityRecordDocument]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityRecordDocument]
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityRecordDocument]
        (
            [EntityID],
            [RecordID],
            [EntityDocumentID],
            [DocumentText],
            [VectorIndexID],
            [VectorID],
            [VectorJSON],
            [EntityRecordUpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @RecordID,
            @EntityDocumentID,
            @DocumentText,
            @VectorIndexID,
            @VectorID,
            @VectorJSON,
            @EntityRecordUpdatedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRecordDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAIModels]'
GO


CREATE VIEW [__mj].[vwAIModels]
AS
SELECT 
    a.*,
    AIModelType_AIModelTypeID.[Name] AS [AIModelType]
FROM
    [__mj].[AIModel] AS a
INNER JOIN
    [__mj].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionExecutionLog]'
GO


CREATE PROCEDURE [__mj].[spCreateActionExecutionLog]
    @ActionID uniqueidentifier,
    @StartedAt datetime,
    @EndedAt datetime,
    @Params nvarchar(MAX),
    @ResultCode nvarchar(255),
    @UserID uniqueidentifier,
    @RetentionPeriod int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionExecutionLog]
        (
            [ActionID],
            [StartedAt],
            [EndedAt],
            [Params],
            [ResultCode],
            [UserID],
            [RetentionPeriod]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @StartedAt,
            @EndedAt,
            @Params,
            @ResultCode,
            @UserID,
            @RetentionPeriod
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionExecutionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocumentRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocumentRun]
    @ID uniqueidentifier,
    @EntityDocumentID uniqueidentifier,
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
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocumentRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Creating [__mj].[spCreateActionLibrary]'
GO


CREATE PROCEDURE [__mj].[spCreateActionLibrary]
    @ActionID uniqueidentifier,
    @LibraryID uniqueidentifier,
    @ItemsUsed nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionLibrary]
        (
            [ActionID],
            [LibraryID],
            [ItemsUsed]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @LibraryID,
            @ItemsUsed
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionLibraries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocument]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocument]
    @ID uniqueidentifier,
    @Name nvarchar(250),
    @TypeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @VectorDatabaseID uniqueidentifier,
    @Status nvarchar(15),
    @TemplateID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocument]
    SET 
        [Name] = @Name,
        [TypeID] = @TypeID,
        [EntityID] = @EntityID,
        [VectorDatabaseID] = @VectorDatabaseID,
        [Status] = @Status,
        [TemplateID] = @TemplateID,
        [AIModelID] = @AIModelID,
        [PotentialMatchThreshold] = @PotentialMatchThreshold,
        [AbsoluteMatchThreshold] = @AbsoluteMatchThreshold
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocuments] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spDeleteflyway_schema_history]'
GO


CREATE PROCEDURE [__mj].[spDeleteflyway_schema_history]
    @installed_rank int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[flyway_schema_history]
    WHERE 
        [installed_rank] = @installed_rank


    SELECT @installed_rank AS [installed_rank] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateLibrary]'
GO


CREATE PROCEDURE [__mj].[spCreateLibrary]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @TypeDefinitions nvarchar(MAX),
    @SampleCode nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Library]
        (
            [Name],
            [Description],
            [Status],
            [TypeDefinitions],
            [SampleCode]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @TypeDefinitions,
            @SampleCode
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLibraries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateVectorDatabase]'
GO


CREATE PROCEDURE [__mj].[spUpdateVectorDatabase]
    @ID uniqueidentifier,
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
        [ClassKey] = @ClassKey
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwVectorDatabases] 
                                    WHERE
                                        [ID] = @ID
                                    
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
    AIModel_AIModelID.[Name] AS [AIModel],
    AIAction_AIActionID.[Name] AS [AIAction],
    Entity_OutputEntityID.[Name] AS [OutputEntity]
FROM
    [__mj].[EntityAIAction] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[AIModel] AS AIModel_AIModelID
  ON
    [e].[AIModelID] = AIModel_AIModelID.[ID]
INNER JOIN
    [__mj].[AIAction] AS AIAction_AIActionID
  ON
    [e].[AIActionID] = AIAction_AIActionID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_OutputEntityID
  ON
    [e].[OutputEntityID] = Entity_OutputEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteScheduledAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteScheduledAction]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ScheduledAction]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionParam]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit,
    @Description nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionParam]
    SET 
        [ActionID] = @ActionID,
        [Name] = @Name,
        [DefaultValue] = @DefaultValue,
        [Type] = @Type,
        [ValueType] = @ValueType,
        [IsArray] = @IsArray,
        [Description] = @Description,
        [IsRequired] = @IsRequired
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDataContextItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateDataContextItem]
    @ID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
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
        [LastRefreshedAt] = @LastRefreshedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDataContextItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[GetProgrammaticName]'
GO

CREATE FUNCTION [__mj].[GetProgrammaticName](@input NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    DECLARE @output NVARCHAR(MAX) = '';
    DECLARE @i INT = 1;
    DECLARE @currentChar NCHAR(1);
    DECLARE @isValid BIT;
    
    -- Loop through each character in the input string
    WHILE @i <= LEN(@input)
    BEGIN
        SET @currentChar = SUBSTRING(@input, @i, 1);
        
        -- Check if the character is alphanumeric or underscore
        SET @isValid = CASE
            WHEN @currentChar LIKE '[A-Za-z0-9_]' THEN 1
            ELSE 0
        END;
        
        -- Append the character or an underscore to the output
        IF @isValid = 1
        BEGIN
            SET @output = @output + @currentChar;
        END
        ELSE
        BEGIN
            SET @output = @output + '_';
        END;
        
        SET @i = @i + 1;
    END;
    
    -- Prepend an underscore if the first character is a number
    IF @output LIKE '[0-9]%'
    BEGIN
        SET @output = '_' + @output;
    END;
    
    RETURN @output;
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntities]'
GO

CREATE VIEW [__mj].[vwEntities]
AS
SELECT 
	e.*,
	__mj.GetProgrammaticName(REPLACE(e.Name,' ','')) AS CodeName, /*For just the CodeName for the entity, we remove spaces before we convert to a programmatic name as many entity names have spaces automatically added to them and it is not needed to make those into _ characters*/
	__mj.GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS ClassName,
	__mj.GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS BaseTableCodeName,
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
PRINT N'Creating [__mj].[vwEntityFieldValues]'
GO


CREATE VIEW [__mj].[vwEntityFieldValues]
AS
SELECT 
    efv.*,
    ef.[Name] AS [EntityField],
    ef.[Entity],
    ef.[EntityID]
FROM
    [__mj].[EntityFieldValue] AS efv
INNER JOIN
    [__mj].[vwEntityFields] AS ef
  ON
    [efv].[EntityFieldID] = ef.ID 
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityFieldValue]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityFieldValue]
    @ID uniqueidentifier,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityFieldValue]
    SET 
        [EntityFieldID] = @EntityFieldID,
        [Sequence] = @Sequence,
        [Value] = @Value,
        [Code] = @Code,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityFieldValues] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteScheduledActionParam]'
GO


CREATE PROCEDURE [__mj].[spDeleteScheduledActionParam]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ScheduledActionParam]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionContext]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionContext]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @ContextTypeID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContext]
    SET 
        [ActionID] = @ActionID,
        [ContextTypeID] = @ContextTypeID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionContexts] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityRecordDocument]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityRecordDocument]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
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
        [EntityDocumentID] = @EntityDocumentID,
        [DocumentText] = @DocumentText,
        [VectorIndexID] = @VectorIndexID,
        [VectorID] = @VectorID,
        [VectorJSON] = @VectorJSON,
        [EntityRecordUpdatedAt] = @EntityRecordUpdatedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRecordDocuments] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAIModel]'
GO


CREATE PROCEDURE [__mj].[spCreateAIModel]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Vendor nvarchar(50),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[AIModel]
        (
            [Name],
            [Description],
            [Vendor],
            [AIModelTypeID],
            [PowerRank],
            [IsActive],
            [DriverClass],
            [DriverImportPath],
            [APIName]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Vendor,
            @AIModelTypeID,
            @PowerRank,
            @IsActive,
            @DriverClass,
            @DriverImportPath,
            @APIName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteExplorerNavigationItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteExplorerNavigationItem]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ExplorerNavigationItem]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionExecutionLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionExecutionLog]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @StartedAt datetime,
    @EndedAt datetime,
    @Params nvarchar(MAX),
    @ResultCode nvarchar(255),
    @UserID uniqueidentifier,
    @RetentionPeriod int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionExecutionLog]
    SET 
        [ActionID] = @ActionID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Params] = @Params,
        [ResultCode] = @ResultCode,
        [UserID] = @UserID,
        [RetentionPeriod] = @RetentionPeriod
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionExecutionLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAIModelAction]'
GO


CREATE PROCEDURE [__mj].[spCreateAIModelAction]
    @AIModelID uniqueidentifier,
    @AIActionID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[AIModelAction]
        (
            [AIModelID],
            [AIActionID],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AIModelID,
            @AIActionID,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIModelActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
PRINT N'Creating [__mj].[spUpdateActionLibrary]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionLibrary]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @LibraryID uniqueidentifier,
    @ItemsUsed nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionLibrary]
    SET 
        [ActionID] = @ActionID,
        [LibraryID] = @LibraryID,
        [ItemsUsed] = @ItemsUsed
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionLibraries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAIAction]'
GO


CREATE PROCEDURE [__mj].[spCreateAIAction]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultPrompt nvarchar(MAX),
    @DefaultModelID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[AIAction]
        (
            [Name],
            [Description],
            [DefaultPrompt],
            [DefaultModelID],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @DefaultPrompt,
            @DefaultModelID,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spUpdateLibrary]'
GO


CREATE PROCEDURE [__mj].[spUpdateLibrary]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @TypeDefinitions nvarchar(MAX),
    @SampleCode nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Library]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [TypeDefinitions] = @TypeDefinitions,
        [SampleCode] = @SampleCode
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLibraries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityAIAction]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityAIAction]
    @EntityID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @AIActionID uniqueidentifier,
    @Name nvarchar(255),
    @Prompt nvarchar(MAX),
    @TriggerEvent nchar(15),
    @UserMessage nvarchar(MAX),
    @OutputType nchar(10),
    @OutputField nvarchar(50),
    @SkipIfOutputFieldNotEmpty bit,
    @OutputEntityID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityAIAction]
        (
            [EntityID],
            [AIModelID],
            [AIActionID],
            [Name],
            [Prompt],
            [TriggerEvent],
            [UserMessage],
            [OutputType],
            [OutputField],
            [SkipIfOutputFieldNotEmpty],
            [OutputEntityID],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @AIModelID,
            @AIActionID,
            @Name,
            @Prompt,
            @TriggerEvent,
            @UserMessage,
            @OutputType,
            @OutputField,
            @SkipIfOutputFieldNotEmpty,
            @OutputEntityID,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityAIActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
    @CompanyID uniqueidentifier,
    @SupervisorID uniqueidentifier,
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Active bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Employee]
        (
            [FirstName],
            [LastName],
            [CompanyID],
            [SupervisorID],
            [Title],
            [Email],
            [Phone],
            [Active]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @FirstName,
            @LastName,
            @CompanyID,
            @SupervisorID,
            @Title,
            @Email,
            @Phone,
            @Active
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEmployees] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIModel]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIModel]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Vendor nvarchar(50),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModel]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Vendor] = @Vendor,
        [AIModelTypeID] = @AIModelTypeID,
        [PowerRank] = @PowerRank,
        [IsActive] = @IsActive,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIModels] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserFavorite]
        (
            [UserID],
            [EntityID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserFavorites] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDataContextItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteDataContextItem]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[DataContextItem]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIModelAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIModelAction]
    @ID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @AIActionID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelAction]
    SET 
        [AIModelID] = @AIModelID,
        [AIActionID] = @AIActionID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIModelActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Company]
        (
            [Name],
            [Description],
            [Website],
            [LogoURL],
            [Domain],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Website,
            @LogoURL,
            @Domain,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCompanies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserViewCategories]'
GO


CREATE VIEW [__mj].[vwUserViewCategories]
AS
SELECT 
    u.*,
    UserViewCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[UserViewCategory] AS u
LEFT OUTER JOIN
    [__mj].[UserViewCategory] AS UserViewCategory_ParentID
  ON
    [u].[ParentID] = UserViewCategory_ParentID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIAction]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultPrompt nvarchar(MAX),
    @DefaultModelID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIAction]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DefaultPrompt] = @DefaultPrompt,
        [DefaultModelID] = @DefaultModelID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployeeCompanyIntegration]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployeeCompanyIntegration]
    @ID uniqueidentifier,
    @EmployeeID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(750),
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
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployeeCompanyIntegrations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spUpdateEntityAIAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityAIAction]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @AIActionID uniqueidentifier,
    @Name nvarchar(255),
    @Prompt nvarchar(MAX),
    @TriggerEvent nchar(15),
    @UserMessage nvarchar(MAX),
    @OutputType nchar(10),
    @OutputField nvarchar(50),
    @SkipIfOutputFieldNotEmpty bit,
    @OutputEntityID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAIAction]
    SET 
        [EntityID] = @EntityID,
        [AIModelID] = @AIModelID,
        [AIActionID] = @AIActionID,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityAIActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployeeRole]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployeeRole]
    @ID uniqueidentifier,
    @EmployeeID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeRole]
    SET 
        [EmployeeID] = @EmployeeID,
        [RoleID] = @RoleID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployeeRoles] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionParam]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionParam]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionParam]
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
PRINT N'Creating [__mj].[spUpdateEmployee]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployee]
    @ID uniqueidentifier,
    @FirstName nvarchar(30),
    @LastName nvarchar(50),
    @CompanyID uniqueidentifier,
    @SupervisorID uniqueidentifier,
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Active bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Employee]
    SET 
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [CompanyID] = @CompanyID,
        [SupervisorID] = @SupervisorID,
        [Title] = @Title,
        [Email] = @Email,
        [Phone] = @Phone,
        [Active] = @Active
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployees] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionContext]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionContext]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionContext]
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
    DashboardCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[DashboardCategory] AS d
LEFT OUTER JOIN
    [__mj].[DashboardCategory] AS DashboardCategory_ParentID
  ON
    [d].[ParentID] = DashboardCategory_ParentID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserFavorite]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserFavorite]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserFavorite]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserFavorites] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionLibrary]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionLibrary]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionLibrary]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwReportCategories]'
GO


CREATE VIEW [__mj].[vwReportCategories]
AS
SELECT 
    r.*,
    ReportCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[ReportCategory] AS r
LEFT OUTER JOIN
    [__mj].[ReportCategory] AS ReportCategory_ParentID
  ON
    [r].[ParentID] = ReportCategory_ParentID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompany]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompany]
    @ID uniqueidentifier,
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
        [Domain] = @Domain
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanies] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionExecutionLog]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionExecutionLog]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionExecutionLog]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserViewCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [EntityID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @EntityID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViewCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCommunicationLogs]'
GO


CREATE VIEW [__mj].[vwCommunicationLogs]
AS
SELECT 
    c.*,
    CommunicationProvider_CommunicationProviderID.[Name] AS [CommunicationProvider],
    CommunicationProviderMessageType_CommunicationProviderMessageTypeID.[Name] AS [CommunicationProviderMessageType]
FROM
    [__mj].[CommunicationLog] AS c
INNER JOIN
    [__mj].[CommunicationProvider] AS CommunicationProvider_CommunicationProviderID
  ON
    [c].[CommunicationProviderID] = CommunicationProvider_CommunicationProviderID.[ID]
INNER JOIN
    [__mj].[CommunicationProviderMessageType] AS CommunicationProviderMessageType_CommunicationProviderMessageTypeID
  ON
    [c].[CommunicationProviderMessageTypeID] = CommunicationProviderMessageType_CommunicationProviderMessageTypeID.[ID]
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwFileStorageProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteAIModel]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIModel]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[AIModel]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCommunicationProviders]'
GO


CREATE VIEW [__mj].[vwCommunicationProviders]
AS
SELECT 
    c.*
FROM
    [__mj].[CommunicationProvider] AS c
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDataContext]'
GO


CREATE PROCEDURE [__mj].[spCreateDataContext]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[DataContext]
        (
            [Name],
            [Description],
            [UserID],
            [LastRefreshedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @UserID,
            @LastRefreshedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDataContexts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteAIModelAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIModelAction]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[AIModelAction]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwListCategories]'
GO


CREATE VIEW [__mj].[vwListCategories]
AS
SELECT 
    l.*
FROM
    [__mj].[ListCategory] AS l
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateReportCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateReportCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ReportCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwReportCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteAIAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIAction]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[AIAction]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCommunicationProviderMessageTypes]'
GO


CREATE VIEW [__mj].[vwCommunicationProviderMessageTypes]
AS
SELECT 
    c.*,
    CommunicationProvider_CommunicationProviderID.[Name] AS [CommunicationProvider],
    CommunicationBaseMessageType_CommunicationBaseMessageTypeID.[Type] AS [CommunicationBaseMessageType]
FROM
    [__mj].[CommunicationProviderMessageType] AS c
INNER JOIN
    [__mj].[CommunicationProvider] AS CommunicationProvider_CommunicationProviderID
  ON
    [c].[CommunicationProviderID] = CommunicationProvider_CommunicationProviderID.[ID]
INNER JOIN
    [__mj].[CommunicationBaseMessageType] AS CommunicationBaseMessageType_CommunicationBaseMessageTypeID
  ON
    [c].[CommunicationBaseMessageTypeID] = CommunicationBaseMessageType_CommunicationBaseMessageTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDashboardCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateDashboardCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[DashboardCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDashboardCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityAIAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityAIAction]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityAIAction]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCommunicationRuns]'
GO


CREATE VIEW [__mj].[vwCommunicationRuns]
AS
SELECT 
    c.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[CommunicationRun] AS c
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserViewCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserViewCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [EntityID] = @EntityID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserViewCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Creating [__mj].[spDeleteEmployee]'
GO


CREATE PROCEDURE [__mj].[spDeleteEmployee]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateCommunicationLog]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationLog]
    @CommunicationProviderID uniqueidentifier,
    @CommunicationProviderMessageTypeID uniqueidentifier,
    @CommunicationRunID uniqueidentifier,
    @Direction nvarchar(20),
    @MessageDate datetime,
    @Status nvarchar(20),
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[CommunicationLog]
        (
            [CommunicationProviderID],
            [CommunicationProviderMessageTypeID],
            [CommunicationRunID],
            [Direction],
            [MessageDate],
            [Status],
            [MessageContent],
            [ErrorMessage]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @CommunicationProviderID,
            @CommunicationProviderMessageTypeID,
            @CommunicationRunID,
            @Direction,
            @MessageDate,
            @Status,
            @MessageContent,
            @ErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFileStorageProvider]'
GO


CREATE PROCEDURE [__mj].[spUpdateFileStorageProvider]
    @ID uniqueidentifier,
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
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFileStorageProviders] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDashboards]'
GO


CREATE VIEW [__mj].[vwDashboards]
AS
SELECT 
    d.*,
    User_UserID.[Name] AS [User],
    DashboardCategory_CategoryID.[Name] AS [Category]
FROM
    [__mj].[Dashboard] AS d
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserFavorite]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserFavorite]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateCommunicationProvider]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationProvider]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[CommunicationProvider]
        (
            [Name],
            [Description],
            [Status],
            [SupportsSending],
            [SupportsReceiving]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @SupportsSending,
            @SupportsReceiving
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDataContext]'
GO


CREATE PROCEDURE [__mj].[spUpdateDataContext]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContext]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [LastRefreshedAt] = @LastRefreshedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDataContexts] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueueTasks]'
GO


CREATE VIEW [__mj].[vwQueueTasks]
AS
SELECT 
    q.*,
    Queue_QueueID.[Name] AS [Queue]
FROM
    [__mj].[QueueTask] AS q
INNER JOIN
    [__mj].[Queue] AS Queue_QueueID
  ON
    [q].[QueueID] = Queue_QueueID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteCompany]'
GO


CREATE PROCEDURE [__mj].[spDeleteCompany]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateListCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateListCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ListCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwListCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateReportCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateReportCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwReportCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spCreateCommunicationProviderMessageType]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationProviderMessageType]
    @CommunicationProviderID uniqueidentifier,
    @CommunicationBaseMessageTypeID uniqueidentifier,
    @Name nvarchar(255),
    @Status nvarchar(20),
    @AdditionalAttributes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[CommunicationProviderMessageType]
        (
            [CommunicationProviderID],
            [CommunicationBaseMessageTypeID],
            [Name],
            [Status],
            [AdditionalAttributes]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @CommunicationProviderID,
            @CommunicationBaseMessageTypeID,
            @Name,
            @Status,
            @AdditionalAttributes
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationProviderMessageTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDashboardCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateDashboardCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DashboardCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDashboardCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spCreateCommunicationRun]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationRun]
    @UserID uniqueidentifier,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetime,
    @EndedAt datetime,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[CommunicationRun]
        (
            [UserID],
            [Direction],
            [Status],
            [StartedAt],
            [EndedAt],
            [Comments],
            [ErrorMessage]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @Direction,
            @Status,
            @StartedAt,
            @EndedAt,
            @Comments,
            @ErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDashboard]'
GO


CREATE PROCEDURE [__mj].[spCreateDashboard]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Dashboard]
        (
            [Name],
            [Description],
            [UserID],
            [CategoryID],
            [UIConfigDetails]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @UserID,
            @CategoryID,
            @UIConfigDetails
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDashboards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spUpdateCommunicationLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationLog]
    @ID uniqueidentifier,
    @CommunicationProviderID uniqueidentifier,
    @CommunicationProviderMessageTypeID uniqueidentifier,
    @CommunicationRunID uniqueidentifier,
    @Direction nvarchar(20),
    @MessageDate datetime,
    @Status nvarchar(20),
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationLog]
    SET 
        [CommunicationProviderID] = @CommunicationProviderID,
        [CommunicationProviderMessageTypeID] = @CommunicationProviderMessageTypeID,
        [CommunicationRunID] = @CommunicationRunID,
        [Direction] = @Direction,
        [MessageDate] = @MessageDate,
        [Status] = @Status,
        [MessageContent] = @MessageContent,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueueTask]'
GO


CREATE PROCEDURE [__mj].[spCreateQueueTask]
    @QueueID uniqueidentifier,
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwQueueTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
PRINT N'Creating [__mj].[spUpdateCommunicationProvider]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationProvider]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [SupportsSending] = @SupportsSending,
        [SupportsReceiving] = @SupportsReceiving
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationProviders] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAIModelType]'
GO


CREATE PROCEDURE [__mj].[spCreateAIModelType]
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[AIModelType]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIModelTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwIntegrationURLFormats]'
GO

CREATE VIEW [__mj].[vwIntegrationURLFormats]
AS
SELECT 
	iuf.*,
	i.Name Integration,
	i.NavigationBaseURL,
	i.NavigationBaseURL + iuf.URLFormat FullURLFormat
FROM
	__mj.IntegrationURLFormat iuf
INNER JOIN
	__mj.Integration i
ON
	iuf.IntegrationID = i.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateIntegrationURLFormat]'
GO


CREATE PROCEDURE [__mj].[spUpdateIntegrationURLFormat]
    @ID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @URLFormat nvarchar(500),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[IntegrationURLFormat]
    SET 
        [IntegrationID] = @IntegrationID,
        [EntityID] = @EntityID,
        [URLFormat] = @URLFormat,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwIntegrationURLFormats] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateListCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateListCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwListCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueue]'
GO


CREATE PROCEDURE [__mj].[spCreateQueue]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID uniqueidentifier,
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwQueues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEmployeeSkill]'
GO


CREATE PROCEDURE [__mj].[spUpdateEmployeeSkill]
    @ID uniqueidentifier,
    @EmployeeID uniqueidentifier,
    @SkillID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeSkill]
    SET 
        [EmployeeID] = @EmployeeID,
        [SkillID] = @SkillID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployeeSkills] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCommunicationProviderMessageType]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationProviderMessageType]
    @ID uniqueidentifier,
    @CommunicationProviderID uniqueidentifier,
    @CommunicationBaseMessageTypeID uniqueidentifier,
    @Name nvarchar(255),
    @Status nvarchar(20),
    @AdditionalAttributes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProviderMessageType]
    SET 
        [CommunicationProviderID] = @CommunicationProviderID,
        [CommunicationBaseMessageTypeID] = @CommunicationBaseMessageTypeID,
        [Name] = @Name,
        [Status] = @Status,
        [AdditionalAttributes] = @AdditionalAttributes
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationProviderMessageTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDashboard]'
GO


CREATE PROCEDURE [__mj].[spUpdateDashboard]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Dashboard]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDashboards] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Role]
        (
            [Name],
            [Description],
            [DirectoryID],
            [SQLName]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @DirectoryID,
            @SQLName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRoles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCommunicationRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationRun]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetime,
    @EndedAt datetime,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationRun]
    SET 
        [UserID] = @UserID,
        [Direction] = @Direction,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Comments] = @Comments,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserViewCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserViewCategory]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateQueueTask]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueueTask]
    @ID uniqueidentifier,
    @QueueID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueueTasks] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateIntegration]'
GO


CREATE PROCEDURE [__mj].[spUpdateIntegration]
    @Name nvarchar(100),
    @Description nvarchar(255),
    @NavigationBaseURL nvarchar(500),
    @ClassName nvarchar(100),
    @ImportPath nvarchar(100),
    @BatchMaxRequestCount int,
    @BatchRequestWaitTime int,
    @ID uniqueidentifier
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
        [BatchRequestWaitTime] = @BatchRequestWaitTime
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwIntegrations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDataContext]'
GO


CREATE PROCEDURE [__mj].[spDeleteDataContext]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[DataContext]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAIModelType]'
GO


CREATE PROCEDURE [__mj].[spUpdateAIModelType]
    @ID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIModelTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteReportCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteReportCategory]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateQueue]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueue]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID uniqueidentifier,
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
        [LastHeartbeat] = @LastHeartbeat
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueues] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDashboardCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteDashboardCategory]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateRole]'
GO


CREATE PROCEDURE [__mj].[spUpdateRole]
    @ID uniqueidentifier,
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
        [SQLName] = @SQLName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRoles] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Creating [__mj].[vwDuplicateRunDetailMatches]'
GO


CREATE VIEW [__mj].[vwDuplicateRunDetailMatches]
AS
SELECT 
    d.*
FROM
    [__mj].[DuplicateRunDetailMatch] AS d
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteCommunicationProviderMessageType]'
GO


CREATE PROCEDURE [__mj].[spDeleteCommunicationProviderMessageType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[CommunicationProviderMessageType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
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
PRINT N'Creating [__mj].[spDeleteRole]'
GO


CREATE PROCEDURE [__mj].[spDeleteRole]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[vwTemplateCategories]'
GO


CREATE VIEW [__mj].[vwTemplateCategories]
AS
SELECT 
    t.*,
    TemplateCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[TemplateCategory] AS t
LEFT OUTER JOIN
    [__mj].[TemplateCategory] AS TemplateCategory_ParentID
  ON
    [t].[ParentID] = TemplateCategory_ParentID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [t].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwFiles]'
GO


CREATE VIEW [__mj].[vwFiles]
AS
SELECT 
    f.*,
    FileCategory_CategoryID.[Name] AS [Category],
    FileStorageProvider_ProviderID.[Name] AS [Provider]
FROM
    [__mj].[File] AS f
LEFT OUTER JOIN
    [__mj].[FileCategory] AS FileCategory_CategoryID
  ON
    [f].[CategoryID] = FileCategory_CategoryID.[ID]
INNER JOIN
    [__mj].[FileStorageProvider] AS FileStorageProvider_ProviderID
  ON
    [f].[ProviderID] = FileStorageProvider_ProviderID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDashboard]'
GO


CREATE PROCEDURE [__mj].[spDeleteDashboard]
    @ID uniqueidentifier
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
    @CodeType nvarchar(50),
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
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
            [CodeType],
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
            [RelatedEntityNameFieldMap],
            [RelatedEntityDisplayType],
            [EntityIDFieldName]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
            @CodeType,
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
            @RelatedEntityNameFieldMap,
            @RelatedEntityDisplayType,
            @EntityIDFieldName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTemplateContents]'
GO


CREATE VIEW [__mj].[vwTemplateContents]
AS
SELECT 
    t.*,
    Template_TemplateID.[Name] AS [Template],
    TemplateContentType_TypeID.[Name] AS [Type]
FROM
    [__mj].[TemplateContent] AS t
INNER JOIN
    [__mj].[Template] AS Template_TemplateID
  ON
    [t].[TemplateID] = Template_TemplateID.[ID]
INNER JOIN
    [__mj].[TemplateContentType] AS TemplateContentType_TypeID
  ON
    [t].[TypeID] = TemplateContentType_TypeID.[ID]
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwVersionInstallations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteAIModelType]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIModelType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[AIModelType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
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
    @LinkedEntityID uniqueidentifier,
    @LinkedEntityRecordID nvarchar(450),
    @EmployeeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
            [LinkedEntityID],
            [LinkedEntityRecordID],
            [EmployeeID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
            @LinkedEntityID,
            @LinkedEntityRecordID,
            @EmployeeID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTemplateParams]'
GO


CREATE VIEW [__mj].[vwTemplateParams]
AS
SELECT 
    t.*,
    Template_TemplateID.[Name] AS [Template],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[TemplateParam] AS t
INNER JOIN
    [__mj].[Template] AS Template_TemplateID
  ON
    [t].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [t].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFileEntityRecordLink]'
GO


CREATE PROCEDURE [__mj].[spCreateFileEntityRecordLink]
    @FileID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[FileEntityRecordLink]
        (
            [FileID],
            [EntityID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @FileID,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFileEntityRecordLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spCreateEntity]'
GO


CREATE PROCEDURE [__mj].[spCreateEntity]
    @ParentID uniqueidentifier,
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
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
            [DeleteType],
            [AllowRecordMerge],
            [spMatch],
            [RelationshipDefaultDisplayType],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
            @DeleteType,
            @AllowRecordMerge,
            @spMatch,
            @RelationshipDefaultDisplayType,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCommunicationBaseMessageTypes]'
GO


CREATE VIEW [__mj].[vwCommunicationBaseMessageTypes]
AS
SELECT 
    c.*
FROM
    [__mj].[CommunicationBaseMessageType] AS c
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFileCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateFileCategory]
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[FileCategory]
        (
            [Name],
            [ParentID],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @ParentID,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFileCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
    Workflow_OutputWorkflowID.[Name] AS [OutputWorkflow]
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
    [__mj].[Workflow] AS Workflow_OutputWorkflowID
  ON
    [r].[OutputWorkflowID] = Workflow_OutputWorkflowID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCompanyIntegrations]'
GO

CREATE VIEW [__mj].[vwCompanyIntegrations] 
AS
SELECT 
  ci.*,
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
  __mj.Company c ON ci.CompanyID = c.ID
INNER JOIN
  __mj.Integration i ON ci.IntegrationID = i.ID
LEFT OUTER JOIN
  __mj.CompanyIntegrationRun cir 
ON 
  ci.ID = cir.CompanyIntegrationID AND
  cir.ID = (SELECT TOP 1 cirInner.ID FROM __mj.CompanyIntegrationRun cirInner WHERE cirInner.CompanyIntegrationID = ci.ID ORDER BY StartedAt DESC)  
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegration]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegration]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
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
        [CompanyID] = @CompanyID,
        [IntegrationID] = @IntegrationID,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwTemplates]'
GO


CREATE VIEW [__mj].[vwTemplates]
AS
SELECT 
    t.*,
    TemplateCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[Template] AS t
LEFT OUTER JOIN
    [__mj].[TemplateCategory] AS TemplateCategory_CategoryID
  ON
    [t].[CategoryID] = TemplateCategory_CategoryID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [t].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDuplicateRunDetailMatch]'
GO


CREATE PROCEDURE [__mj].[spCreateDuplicateRunDetailMatch]
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetime,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20),
    @MergedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[DuplicateRunDetailMatch]
        (
            [DuplicateRunDetailID],
            [MatchSource],
            [MatchRecordID],
            [MatchProbability],
            [MatchedAt],
            [Action],
            [ApprovalStatus],
            [RecordMergeLogID],
            [MergeStatus],
            [MergedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DuplicateRunDetailID,
            @MatchSource,
            @MatchRecordID,
            @MatchProbability,
            @MatchedAt,
            @Action,
            @ApprovalStatus,
            @RecordMergeLogID,
            @MergeStatus,
            @MergedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDuplicateRunDetailMatches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
	uv.Name DisplayUserViewName
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
	er.DisplayUserViewID = uv.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityRelationship]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityRelationship]
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
            [DisplayLocation],
            [DisplayName],
            [DisplayIconType],
            [DisplayIcon],
            [DisplayComponentID],
            [DisplayComponentConfiguration]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
            @DisplayLocation,
            @DisplayName,
            @DisplayIconType,
            @DisplayIcon,
            @DisplayComponentID,
            @DisplayComponentConfiguration
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplateCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[TemplateCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateFile]'
GO


CREATE PROCEDURE [__mj].[spCreateFile]
    @Name nvarchar(500),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @ProviderID uniqueidentifier,
    @ContentType nvarchar(50),
    @ProviderKey nvarchar(500),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[File]
        (
            [Name],
            [Description],
            [CategoryID],
            [ProviderID],
            [ContentType],
            [ProviderKey],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @ProviderID,
            @ContentType,
            @ProviderKey,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFiles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityField]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
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
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100)
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
        [CodeType] = @CodeType,
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
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplateContent]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateContent]
    @TemplateID uniqueidentifier,
    @TypeID uniqueidentifier,
    @TemplateText nvarchar(MAX),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[TemplateContent]
        (
            [TemplateID],
            [TypeID],
            [TemplateText],
            [Priority],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @TemplateID,
            @TypeID,
            @TemplateText,
            @Priority,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateContents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateVersionInstallation]'
GO


CREATE PROCEDURE [__mj].[spUpdateVersionInstallation]
    @ID uniqueidentifier,
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
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwVersionInstallations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spUpdateUser]'
GO


CREATE PROCEDURE [__mj].[spUpdateUser]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit,
    @LinkedRecordType nchar(10),
    @LinkedEntityID uniqueidentifier,
    @LinkedEntityRecordID nvarchar(450),
    @EmployeeID uniqueidentifier
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
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedEntityRecordID] = @LinkedEntityRecordID,
        [EmployeeID] = @EmployeeID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUsers] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplateParam]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateParam]
    @TemplateID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @LinkedParameterName nvarchar(255),
    @LinkedParameterField nvarchar(500),
    @ExtraFilter nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[TemplateParam]
        (
            [TemplateID],
            [Name],
            [Description],
            [Type],
            [DefaultValue],
            [IsRequired],
            [LinkedParameterName],
            [LinkedParameterField],
            [ExtraFilter],
            [EntityID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @TemplateID,
            @Name,
            @Description,
            @Type,
            @DefaultValue,
            @IsRequired,
            @LinkedParameterName,
            @LinkedParameterField,
            @ExtraFilter,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFileEntityRecordLink]'
GO


CREATE PROCEDURE [__mj].[spUpdateFileEntityRecordLink]
    @ID uniqueidentifier,
    @FileID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileEntityRecordLink]
    SET 
        [FileID] = @FileID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFileEntityRecordLinks] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateReport]'
GO


CREATE PROCEDURE [__mj].[spCreateReport]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
            [OutputFrequency],
            [OutputTargetEmail],
            [OutputWorkflowID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
            @OutputFrequency,
            @OutputTargetEmail,
            @OutputWorkflowID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwReports] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntity]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
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
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500)
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
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntities] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCommunicationBaseMessageType]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationBaseMessageType]
    @Type nvarchar(100),
    @SupportsAttachments bit,
    @SupportsSubjectLine bit,
    @SupportsHtml bit,
    @MaxBytes int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[CommunicationBaseMessageType]
        (
            [Type],
            [SupportsAttachments],
            [SupportsSubjectLine],
            [SupportsHtml],
            [MaxBytes]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Type,
            @SupportsAttachments,
            @SupportsSubjectLine,
            @SupportsHtml,
            @MaxBytes
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationBaseMessageTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFileCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateFileCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileCategory]
    SET 
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFileCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateReportSnapshot]'
GO


CREATE PROCEDURE [__mj].[spCreateReportSnapshot]
    @ReportID uniqueidentifier,
    @ResultSet nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ReportSnapshot]
        (
            [ReportID],
            [ResultSet],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ReportID,
            @ResultSet,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwReportSnapshots] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplate]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplate]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserPrompt nvarchar(MAX),
    @UserID uniqueidentifier,
    @ActiveAt datetime,
    @DisabledAt datetime,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Template]
        (
            [Name],
            [Description],
            [CategoryID],
            [UserPrompt],
            [UserID],
            [ActiveAt],
            [DisabledAt],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @UserPrompt,
            @UserID,
            @ActiveAt,
            @DisabledAt,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateFile]'
GO


CREATE PROCEDURE [__mj].[spUpdateFile]
    @ID uniqueidentifier,
    @Name nvarchar(500),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @ProviderID uniqueidentifier,
    @ContentType nvarchar(50),
    @ProviderKey nvarchar(500),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[File]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [ProviderID] = @ProviderID,
        [ContentType] = @ContentType,
        [ProviderKey] = @ProviderKey,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFiles] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateReport]'
GO


CREATE PROCEDURE [__mj].[spUpdateReport]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier
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
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwReports] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityRelationship]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX)
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
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRelationships] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateTemplateCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDuplicateRunDetailMatch]'
GO


CREATE PROCEDURE [__mj].[spUpdateDuplicateRunDetailMatch]
    @ID uniqueidentifier,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetime,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20),
    @MergedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetailMatch]
    SET 
        [DuplicateRunDetailID] = @DuplicateRunDetailID,
        [MatchSource] = @MatchSource,
        [MatchRecordID] = @MatchRecordID,
        [MatchProbability] = @MatchProbability,
        [MatchedAt] = @MatchedAt,
        [Action] = @Action,
        [ApprovalStatus] = @ApprovalStatus,
        [RecordMergeLogID] = @RecordMergeLogID,
        [MergeStatus] = @MergeStatus,
        [MergedAt] = @MergedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDuplicateRunDetailMatches] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateReportSnapshot]'
GO


CREATE PROCEDURE [__mj].[spUpdateReportSnapshot]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @ResultSet nvarchar(MAX),
    @UserID uniqueidentifier
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwReportSnapshots] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateTemplateContent]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateContent]
    @ID uniqueidentifier,
    @TemplateID uniqueidentifier,
    @TypeID uniqueidentifier,
    @TemplateText nvarchar(MAX),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContent]
    SET 
        [TemplateID] = @TemplateID,
        [TypeID] = @TypeID,
        [TemplateText] = @TemplateText,
        [Priority] = @Priority,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateContents] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateTemplateParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateParam]
    @ID uniqueidentifier,
    @TemplateID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @LinkedParameterName nvarchar(255),
    @LinkedParameterField nvarchar(500),
    @ExtraFilter nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateParam]
    SET 
        [TemplateID] = @TemplateID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [DefaultValue] = @DefaultValue,
        [IsRequired] = @IsRequired,
        [LinkedParameterName] = @LinkedParameterName,
        [LinkedParameterField] = @LinkedParameterField,
        [ExtraFilter] = @ExtraFilter,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCommunicationBaseMessageType]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationBaseMessageType]
    @ID uniqueidentifier,
    @Type nvarchar(100),
    @SupportsAttachments bit,
    @SupportsSubjectLine bit,
    @SupportsHtml bit,
    @MaxBytes int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationBaseMessageType]
    SET 
        [Type] = @Type,
        [SupportsAttachments] = @SupportsAttachments,
        [SupportsSubjectLine] = @SupportsSubjectLine,
        [SupportsHtml] = @SupportsHtml,
        [MaxBytes] = @MaxBytes
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationBaseMessageTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteReport]'
GO


CREATE PROCEDURE [__mj].[spDeleteReport]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateTemplate]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplate]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserPrompt nvarchar(MAX),
    @UserID uniqueidentifier,
    @ActiveAt datetime,
    @DisabledAt datetime,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Template]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserPrompt] = @UserPrompt,
        [UserID] = @UserID,
        [ActiveAt] = @ActiveAt,
        [DisabledAt] = @DisabledAt,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplates] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteReportSnapshot]'
GO


CREATE PROCEDURE [__mj].[spDeleteReportSnapshot]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteEntityField]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityField]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteUser]'
GO


CREATE PROCEDURE [__mj].[spDeleteUser]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteFile]'
GO


CREATE PROCEDURE [__mj].[spDeleteFile]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteEntity]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntity]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteFileCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteFileCategory]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteEntityRelationship]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityRelationship]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[vwEntitySettings]'
GO


CREATE VIEW [__mj].[vwEntitySettings]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[EntitySetting] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwWorkspaceItems]'
GO


CREATE VIEW [__mj].[vwWorkspaceItems]
AS
SELECT 
    w.*,
    Workspace_WorkspaceID.[Name] AS [Workspace],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [__mj].[WorkspaceItem] AS w
INNER JOIN
    [__mj].[Workspace] AS Workspace_WorkspaceID
  ON
    [w].[WorkspaceID] = Workspace_WorkspaceID.[ID]
INNER JOIN
    [__mj].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [w].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
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
PRINT N'Creating [__mj].[vwApplicationSettings]'
GO


CREATE VIEW [__mj].[vwApplicationSettings]
AS
SELECT 
    a.*
FROM
    [__mj].[ApplicationSetting] AS a
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
PRINT N'Creating [__mj].[vwTemplateContentTypes]'
GO


CREATE VIEW [__mj].[vwTemplateContentTypes]
AS
SELECT 
    t.*
FROM
    [__mj].[TemplateContentType] AS t
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDuplicateRunDetails]'
GO


CREATE VIEW [__mj].[vwDuplicateRunDetails]
AS
SELECT 
    d.*
FROM
    [__mj].[DuplicateRunDetail] AS d
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateWorkspace]'
GO


CREATE PROCEDURE [__mj].[spCreateWorkspace]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Workspace]
        (
            [Name],
            [Description],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwWorkspaces] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRunDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRunDetail]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrationRunDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecommendationRuns]'
GO


CREATE VIEW [__mj].[vwRecommendationRuns]
AS
SELECT 
    r.*,
    RecommendationProvider_RecommendationProviderID.[Name] AS [RecommendationProvider],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [__mj].[RecommendationRun] AS r
INNER JOIN
    [__mj].[RecommendationProvider] AS RecommendationProvider_RecommendationProviderID
  ON
    [r].[RecommendationProviderID] = RecommendationProvider_RecommendationProviderID.[ID]
INNER JOIN
    [__mj].[User] AS User_RunByUserID
  ON
    [r].[RunByUserID] = User_RunByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwDuplicateRuns]'
GO


CREATE VIEW [__mj].[vwDuplicateRuns]
AS
SELECT 
    d.*,
    Entity_EntityID.[Name] AS [Entity],
    User_StartedByUserID.[Name] AS [StartedByUser],
    List_SourceListID.[Name] AS [SourceList],
    User_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [__mj].[DuplicateRun] AS d
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[User] AS User_StartedByUserID
  ON
    [d].[StartedByUserID] = User_StartedByUserID.[ID]
INNER JOIN
    [__mj].[List] AS List_SourceListID
  ON
    [d].[SourceListID] = List_SourceListID.[ID]
LEFT OUTER JOIN
    [__mj].[User] AS User_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateWorkspaceItem]'
GO


CREATE PROCEDURE [__mj].[spCreateWorkspaceItem]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkspaceID uniqueidentifier,
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(2000),
    @Sequence int,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[WorkspaceItem]
        (
            [Name],
            [Description],
            [WorkspaceID],
            [ResourceTypeID],
            [ResourceRecordID],
            [Sequence],
            [Configuration]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @WorkspaceID,
            @ResourceTypeID,
            @ResourceRecordID,
            @Sequence,
            @Configuration
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwWorkspaceItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
PRINT N'Creating [__mj].[spUpdateUserRecordLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserRecordLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserRecordLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecommendationProviders]'
GO


CREATE VIEW [__mj].[vwRecommendationProviders]
AS
SELECT 
    r.*
FROM
    [__mj].[RecommendationProvider] AS r
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityDocumentSettings]'
GO


CREATE VIEW [__mj].[vwEntityDocumentSettings]
AS
SELECT 
    e.*,
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument]
FROM
    [__mj].[EntityDocumentSetting] AS e
INNER JOIN
    [__mj].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteTaggedItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteTaggedItem]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateUserView]'
GO


CREATE PROCEDURE [__mj].[spCreateUserView]
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwUserViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecommendations]'
GO


CREATE VIEW [__mj].[vwRecommendations]
AS
SELECT 
    r.*,
    Entity_SourceEntityID.[Name] AS [SourceEntity]
FROM
    [__mj].[Recommendation] AS r
INNER JOIN
    [__mj].[Entity] AS Entity_SourceEntityID
  ON
    [r].[SourceEntityID] = Entity_SourceEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDuplicateRunDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateDuplicateRunDetail]
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[DuplicateRunDetail]
        (
            [DuplicateRunID],
            [RecordID],
            [MatchStatus],
            [SkippedReason],
            [MatchErrorMessage],
            [MergeStatus],
            [MergeErrorMessage]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DuplicateRunID,
            @RecordID,
            @MatchStatus,
            @SkippedReason,
            @MatchErrorMessage,
            @MergeStatus,
            @MergeErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDuplicateRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkspace]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkspace]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkspaces] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateErrorLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateErrorLog]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
    @CompanyIntegrationRunDetailID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwErrorLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecommendationItems]'
GO


CREATE VIEW [__mj].[vwRecommendationItems]
AS
SELECT 
    r.*,
    Entity_DestinationEntityID.[Name] AS [DestinationEntity]
FROM
    [__mj].[RecommendationItem] AS r
INNER JOIN
    [__mj].[Entity] AS Entity_DestinationEntityID
  ON
    [r].[DestinationEntityID] = Entity_DestinationEntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntitySetting]'
GO


CREATE PROCEDURE [__mj].[spCreateEntitySetting]
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntitySetting]
        (
            [EntityID],
            [Name],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntitySettings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkspaceItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkspaceItem]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkspaceID uniqueidentifier,
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(2000),
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
        [WorkspaceID] = @WorkspaceID,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [Sequence] = @Sequence,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkspaceItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRun]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrationRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplateContentType]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateContentType]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CodeType nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[TemplateContentType]
        (
            [Name],
            [Description],
            [CodeType]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CodeType
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateApplicationSetting]'
GO


CREATE PROCEDURE [__mj].[spCreateApplicationSetting]
    @ApplicationID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ApplicationSetting]
        (
            [ApplicationID],
            [Name],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ApplicationID,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplicationSettings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecommendationRun]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendationRun]
    @RecommendationProviderID uniqueidentifier,
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecommendationRun]
        (
            [RecommendationProviderID],
            [StartDate],
            [EndDate],
            [Status],
            [Description],
            [RunByUserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @RecommendationProviderID,
            @StartDate,
            @EndDate,
            @Status,
            @Description,
            @RunByUserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecommendationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDuplicateRun]'
GO


CREATE PROCEDURE [__mj].[spCreateDuplicateRun]
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetime,
    @EndedAt datetime,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[DuplicateRun]
        (
            [EntityID],
            [StartedByUserID],
            [SourceListID],
            [StartedAt],
            [EndedAt],
            [ApprovalStatus],
            [ApprovalComments],
            [ApprovedByUserID],
            [ProcessingStatus],
            [ProcessingErrorMessage]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @StartedByUserID,
            @SourceListID,
            @StartedAt,
            @EndedAt,
            @ApprovalStatus,
            @ApprovalComments,
            @ApprovedByUserID,
            @ProcessingStatus,
            @ProcessingErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDuplicateRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecommendationProvider]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendationProvider]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecommendationProvider]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecommendationProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityDocumentSetting]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocumentSetting]
    @EntityDocumentID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityDocumentSetting]
        (
            [EntityDocumentID],
            [Name],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityDocumentID,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentSettings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteWorkspace]'
GO


CREATE PROCEDURE [__mj].[spDeleteWorkspace]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateUserView]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserView]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
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
        [SortState] = @SortState
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserViews] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecommendation]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendation]
    @RecommendationRunID uniqueidentifier,
    @SourceEntityID uniqueidentifier,
    @SourceEntityRecordID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Recommendation]
        (
            [RecommendationRunID],
            [SourceEntityID],
            [SourceEntityRecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @RecommendationRunID,
            @SourceEntityID,
            @SourceEntityRecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecommendations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
   ae.ApplicationID = a.ID
INNER JOIN
   [__mj].vwEntities e
ON
   ae.EntityID = e.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDuplicateRunDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateDuplicateRunDetail]
    @ID uniqueidentifier,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetail]
    SET 
        [DuplicateRunID] = @DuplicateRunID,
        [RecordID] = @RecordID,
        [MatchStatus] = @MatchStatus,
        [SkippedReason] = @SkippedReason,
        [MatchErrorMessage] = @MatchErrorMessage,
        [MergeStatus] = @MergeStatus,
        [MergeErrorMessage] = @MergeErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDuplicateRunDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteWorkspaceItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteWorkspaceItem]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateRecommendationItem]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendationItem]
    @RecommendationID uniqueidentifier,
    @DestinationEntityID uniqueidentifier,
    @DestinationEntityRecordID nvarchar(450),
    @MatchProbability decimal(18, 15)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecommendationItem]
        (
            [RecommendationID],
            [DestinationEntityID],
            [DestinationEntityRecordID],
            [MatchProbability]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @RecommendationID,
            @DestinationEntityID,
            @DestinationEntityRecordID,
            @MatchProbability
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecommendationItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
PRINT N'Creating [__mj].[spUpdateEntitySetting]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntitySetting]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntitySetting]
    SET 
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntitySettings] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spUpdateTemplateContentType]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateContentType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CodeType nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContentType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CodeType] = @CodeType
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateContentTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
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
  we.Name WorkflowEngineName
FROM
  __mj.WorkflowRun wr
INNER JOIN
  [__mj].vwWorkflows w
ON
  wr.WorkflowID = w.ID
INNER JOIN
  __mj.WorkflowEngine we
ON
  w.WorkflowEngineID = we.ID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateApplicationSetting]'
GO


CREATE PROCEDURE [__mj].[spUpdateApplicationSetting]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationSetting]
    SET 
        [ApplicationID] = @ApplicationID,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplicationSettings] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spUpdateRecommendationRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendationRun]
    @ID uniqueidentifier,
    @RecommendationProviderID uniqueidentifier,
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationRun]
    SET 
        [RecommendationProviderID] = @RecommendationProviderID,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status,
        [Description] = @Description,
        [RunByUserID] = @RunByUserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendationRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Creating [__mj].[spUpdateDuplicateRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateDuplicateRun]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetime,
    @EndedAt datetime,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRun]
    SET 
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [SourceListID] = @SourceListID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDuplicateRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
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
    User_UserID.[Name] AS [User],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [__mj].[UserNotification] AS u
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [u].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserView]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserView]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateRecommendationProvider]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendationProvider]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendationProviders] 
                                    WHERE
                                        [ID] = @ID
                                    
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
    User_UserID.[Name] AS [User],
    Integration_IntegrationID.[Name] AS [Integration]
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
LEFT OUTER JOIN
    [__mj].[Integration] AS Integration_IntegrationID
  ON
    [r].[IntegrationID] = Integration_IntegrationID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordChange_Internal]'
GO

CREATE PROCEDURE [__mj].[spCreateRecordChange_Internal]
    @EntityName nvarchar(100),
    @RecordID NVARCHAR(750),
	  @UserID uniqueidentifier,
    @Type nvarchar(20),
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nchar(15),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecordChange]
        (
            EntityID,
            RecordID,
			      UserID,
            Type,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            (SELECT ID FROM __mj.Entity WHERE Name = @EntityName),
            @RecordID,
			      @UserID,
            @Type,
            GETUTCDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments
        )

    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].vwRecordChanges WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END

GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocumentSetting]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocumentSetting]
    @ID uniqueidentifier,
    @EntityDocumentID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentSetting]
    SET 
        [EntityDocumentID] = @EntityDocumentID,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocumentSettings] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Creating [__mj].[spUpdateRecommendation]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendation]
    @ID uniqueidentifier,
    @RecommendationRunID uniqueidentifier,
    @SourceEntityID uniqueidentifier,
    @SourceEntityRecordID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Recommendation]
    SET 
        [RecommendationRunID] = @RecommendationRunID,
        [SourceEntityID] = @SourceEntityID,
        [SourceEntityRecordID] = @SourceEntityRecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendations] 
                                    WHERE
                                        [ID] = @ID
                                    
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
    Role_RoleName.Name as RoleName,
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
    [e].[RoleID] = Role_RoleName.ID
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
PRINT N'Creating [__mj].[spUpdateRecommendationItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendationItem]
    @ID uniqueidentifier,
    @RecommendationID uniqueidentifier,
    @DestinationEntityID uniqueidentifier,
    @DestinationEntityRecordID nvarchar(450),
    @MatchProbability decimal(18, 15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationItem]
    SET 
        [RecommendationID] = @RecommendationID,
        [DestinationEntityID] = @DestinationEntityID,
        [DestinationEntityRecordID] = @DestinationEntityRecordID,
        [MatchProbability] = @MatchProbability
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendationItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateConversation]'
GO


CREATE PROCEDURE [__mj].[spCreateConversation]
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spCreateUserApplicationEntity]
    @UserApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserApplicationEntity]
        (
            [UserApplicationID],
            [EntityID],
            [Sequence]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserApplicationID,
            @EntityID,
            @Sequence
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserApplicationEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewRunWithDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewRunWithDetail](@UserViewID uniqueidentifier, @UserEmail NVARCHAR(255), @RecordIDList __mj.IDListTableType READONLY) 
AS
DECLARE @RunID uniqueidentifier
DECLARE @Now DATETIME
SELECT @Now=GETDATE()
DECLARE @outputTable TABLE (ID uniqueidentifier, UserViewID uniqueidentifier, RunAt DATETIME, RunByUserID INT, UserView NVARCHAR(100), RunByUser NVARCHAR(100))
DECLARE @UserID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateUserNotification]'
GO


CREATE PROCEDURE [__mj].[spCreateUserNotification]
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID int,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwUserNotifications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spCreateApplicationEntity]
    @ApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ApplicationEntity]
        (
            [ApplicationID],
            [EntityID],
            [Sequence],
            [DefaultForNewUser]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ApplicationID,
            @EntityID,
            @Sequence,
            @DefaultForNewUser
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplicationEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateConversationDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateConversationDetail]
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityPermission]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityPermission]
    @EntityID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanCreate bit,
    @CanRead bit,
    @CanUpdate bit,
    @CanDelete bit,
    @ReadRLSFilterID uniqueidentifier,
    @CreateRLSFilterID uniqueidentifier,
    @UpdateRLSFilterID uniqueidentifier,
    @DeleteRLSFilterID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityPermission]
        (
            [EntityID],
            [RoleID],
            [CanCreate],
            [CanRead],
            [CanUpdate],
            [CanDelete],
            [ReadRLSFilterID],
            [CreateRLSFilterID],
            [UpdateRLSFilterID],
            [DeleteRLSFilterID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @RoleID,
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
    SELECT * FROM [__mj].[vwEntityPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
PRINT N'Creating [__mj].[spUpdateUserNotification]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserNotification]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
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
        [ReadAt] = @ReadAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserNotifications] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateApplication]'
GO


CREATE PROCEDURE [__mj].[spCreateApplication]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Application]
        (
            [Name],
            [Description],
            [Icon],
            [DefaultForNewUser],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Icon,
            @DefaultForNewUser,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
  basetable_columns.column_id BaseTableSequence,
	c.name FieldName,
	COALESCE(bt.name, t.name) Type, -- get the type from the base type (bt) if it exists, this is in the case of a user-defined type being used, t.name would be the UDT name.
	IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType, -- we have a user defined type, so pass that to the view caller too
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	IIF(COALESCE(bt.name, t.name) IN ('timestamp', 'rowversion'), 1, IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity)) AutoIncrement,
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
	basetable_columns.column_id = dc.parent_column_id
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
PRINT N'Creating [__mj].[spDeleteApplicationSetting]'
GO


CREATE PROCEDURE [__mj].[spDeleteApplicationSetting]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ApplicationSetting]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateConversation]'
GO


CREATE PROCEDURE [__mj].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier
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
        [DataContextID] = @DataContextID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwConversations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserApplication]'
GO


CREATE PROCEDURE [__mj].[spCreateUserApplication]
    @UserID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @Sequence int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserApplication]
        (
            [UserID],
            [ApplicationID],
            [Sequence],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @ApplicationID,
            @Sequence,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
UPDATE __mj.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
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
PRINT N'Creating [__mj].[vwEntityActions]'
GO


CREATE VIEW [__mj].[vwEntityActions]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    Action_ActionID.[Name] AS [Action]
FROM
    [__mj].[EntityAction] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [e].[ActionID] = Action_ActionID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateConversationDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier,
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
        [HiddenToUser] = @HiddenToUser
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwConversationDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserApplicationEntity]
    @ID uniqueidentifier,
    @UserApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserApplicationEntities] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwRecordChangeReplayRuns]'
GO


CREATE VIEW [__mj].[vwRecordChangeReplayRuns]
AS
SELECT 
    r.*,
    User_UserID.[Name] AS [User]
FROM
    [__mj].[RecordChangeReplayRun] AS r
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
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
PRINT N'Creating [__mj].[vwEntityActionInvocationTypes]'
GO


CREATE VIEW [__mj].[vwEntityActionInvocationTypes]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityActionInvocationType] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spUpdateApplicationEntity]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationEntity]
    SET 
        [ApplicationID] = @ApplicationID,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [DefaultForNewUser] = @DefaultForNewUser
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplicationEntities] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityCommunicationFields]'
GO


CREATE VIEW [__mj].[vwEntityCommunicationFields]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityCommunicationField] AS e
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
        __mj_UpdatedAt = GETUTCDATE()
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
PRINT N'Creating [__mj].[vwActionCategories]'
GO


CREATE VIEW [__mj].[vwActionCategories]
AS
SELECT 
    a.*,
    ActionCategory_ParentID.[Name] AS [Parent]
FROM
    [__mj].[ActionCategory] AS a
LEFT OUTER JOIN
    [__mj].[ActionCategory] AS ActionCategory_ParentID
  ON
    [a].[ParentID] = ActionCategory_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityPermission]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityPermission]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanCreate bit,
    @CanRead bit,
    @CanUpdate bit,
    @CanDelete bit,
    @ReadRLSFilterID uniqueidentifier,
    @CreateRLSFilterID uniqueidentifier,
    @UpdateRLSFilterID uniqueidentifier,
    @DeleteRLSFilterID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityPermission]
    SET 
        [EntityID] = @EntityID,
        [RoleID] = @RoleID,
        [CanCreate] = @CanCreate,
        [CanRead] = @CanRead,
        [CanUpdate] = @CanUpdate,
        [CanDelete] = @CanDelete,
        [ReadRLSFilterID] = @ReadRLSFilterID,
        [CreateRLSFilterID] = @CreateRLSFilterID,
        [UpdateRLSFilterID] = @UpdateRLSFilterID,
        [DeleteRLSFilterID] = @DeleteRLSFilterID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityPermissions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityCommunicationMessageTypes]'
GO


CREATE VIEW [__mj].[vwEntityCommunicationMessageTypes]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    CommunicationBaseMessageType_BaseMessageTypeID.[Type] AS [BaseMessageType]
FROM
    [__mj].[EntityCommunicationMessageType] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[CommunicationBaseMessageType] AS CommunicationBaseMessageType_BaseMessageTypeID
  ON
    [e].[BaseMessageTypeID] = CommunicationBaseMessageType_BaseMessageTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityActionInvocations]'
GO


CREATE VIEW [__mj].[vwEntityActionInvocations]
AS
SELECT 
    e.*,
    EntityActionInvocationType_InvocationTypeID.[Name] AS [InvocationType]
FROM
    [__mj].[EntityActionInvocation] AS e
INNER JOIN
    [__mj].[EntityActionInvocationType] AS EntityActionInvocationType_InvocationTypeID
  ON
    [e].[InvocationTypeID] = EntityActionInvocationType_InvocationTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateApplication]'
GO


CREATE PROCEDURE [__mj].[spUpdateApplication]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [DefaultForNewUser] = @DefaultForNewUser
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplications] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwLibraryItems]'
GO


CREATE VIEW [__mj].[vwLibraryItems]
AS
SELECT 
    l.*,
    Library_LibraryID.[Name] AS [Library]
FROM
    [__mj].[LibraryItem] AS l
INNER JOIN
    [__mj].[Library] AS Library_LibraryID
  ON
    [l].[LibraryID] = Library_LibraryID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionAuthorizations]'
GO


CREATE VIEW [__mj].[vwActionAuthorizations]
AS
SELECT 
    a.*,
    Action_ActionID.[Name] AS [Action]
FROM
    [__mj].[ActionAuthorization] AS a
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserNotification]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserNotification]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateUserApplication]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserApplication]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ApplicationID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserApplications] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityRelationshipDisplayComponents]'
GO


CREATE VIEW [__mj].[vwEntityRelationshipDisplayComponents]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityRelationshipDisplayComponent] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityAction]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityAction]
    @EntityID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityAction]
        (
            [EntityID],
            [ActionID],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @ActionID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteConversationDetail]'
GO


CREATE PROCEDURE [__mj].[spDeleteConversationDetail]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateRecordChangeReplayRun]'
GO


CREATE PROCEDURE [__mj].[spCreateRecordChangeReplayRun]
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(50),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecordChangeReplayRun]
        (
            [StartedAt],
            [EndedAt],
            [Status],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @StartedAt,
            @EndedAt,
            @Status,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordChangeReplayRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
	__mj_UpdatedAt = GETUTCDATE()
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
PRINT N'Creating [__mj].[spCreateEntityActionInvocationType]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionInvocationType]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @DisplaySequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityActionInvocationType]
        (
            [Name],
            [Description],
            [DisplaySequence]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @DisplaySequence
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionInvocationTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spCreateEntityCommunicationField]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityCommunicationField]
    @EntityCommunicationMessageTypeID uniqueidentifier,
    @FieldName nvarchar(500),
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityCommunicationField]
        (
            [EntityCommunicationMessageTypeID],
            [FieldName],
            [Priority]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityCommunicationMessageTypeID,
            @FieldName,
            @Priority
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityCommunicationFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteConversation]'
GO

CREATE PROCEDURE [__mj].[spDeleteConversation]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateActionCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateActionCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [Status],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @Status,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spCreateLibraryItem]'
GO


CREATE PROCEDURE [__mj].[spCreateLibraryItem]
    @Name nvarchar(255),
    @LibraryID uniqueidentifier,
    @Type nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[LibraryItem]
        (
            [Name],
            [LibraryID],
            [Type]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @LibraryID,
            @Type
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLibraryItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRun]'
GO

CREATE PROC [__mj].[spCreateCompanyIntegrationRun]
@CompanyIntegrationID AS uniqueidentifier,
@RunByUserID AS uniqueidentifier,
@StartedAt AS DATETIMEOFFSET(7) = NULL, 
@Comments AS NVARCHAR(MAX) = NULL,
@TotalRecords INT = NULL,
@NewID AS uniqueidentifier OUTPUT
AS
DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
INSERT INTO __mj.CompanyIntegrationRun
(  
  CompanyIntegrationID,
  RunByUserID,
  StartedAt,
  TotalRecords,
  Comments
)
OUTPUT INSERTED.[ID] INTO @InsertedRow
VALUES
(
  @CompanyIntegrationID,
  @RunByUserID,
  IIF(@StartedAt IS NULL, GETDATE(), @StartedAt),
  IIF(@TotalRecords IS NULL, 0, @TotalRecords),
  @Comments 
)

SELECT @NewID=ID FROM @InsertedRow
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionAuthorization]'
GO


CREATE PROCEDURE [__mj].[spCreateActionAuthorization]
    @ActionID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionAuthorization]
        (
            [ActionID],
            [AuthorizationID],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @AuthorizationID,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionAuthorizations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spCreateEntityCommunicationMessageType]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityCommunicationMessageType]
    @EntityID uniqueidentifier,
    @BaseMessageTypeID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityCommunicationMessageType]
        (
            [EntityID],
            [BaseMessageTypeID],
            [IsActive]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @BaseMessageTypeID,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityCommunicationMessageTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRunAPILog]'
GO

CREATE PROC [__mj].[spCreateCompanyIntegrationRunAPILog]
(@CompanyIntegrationRunID uniqueidentifier, @RequestMethod NVARCHAR(12), @URL NVARCHAR(MAX), @Parameters NVARCHAR(MAX)=NULL, @IsSuccess BIT)
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
PRINT N'Creating [__mj].[spCreateEntityActionInvocation]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionInvocation]
    @EntityActionID uniqueidentifier,
    @InvocationTypeID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityActionInvocation]
        (
            [EntityActionID],
            [InvocationTypeID],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityActionID,
            @InvocationTypeID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionInvocations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spCreateEntityRelationshipDisplayComponent]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityRelationshipDisplayComponent]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @RelationshipType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityRelationshipDisplayComponent]
        (
            [Name],
            [Description],
            [RelationshipType]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @RelationshipType
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRelationshipDisplayComponents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateErrorLog]'
GO

CREATE PROC [__mj].[spCreateErrorLog]
(
@CompanyIntegrationRunID AS uniqueidentifier = NULL,
@CompanyIntegrationRunDetailID AS uniqueidentifier = NULL,
@Code AS NCHAR(20) = NULL,
@Status AS NVARCHAR(10) = NULL,
@Category AS NVARCHAR(20) = NULL,
@Message AS NVARCHAR(MAX) = NULL,
@Details AS NVARCHAR(MAX) = NULL,
@ErrorLogID AS uniqueidentifier OUTPUT
)
AS
DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)


INSERT INTO [__mj].[ErrorLog]
           ([CompanyIntegrationRunID]
           ,[CompanyIntegrationRunDetailID]
           ,[Code]
		   ,[Status]
		   ,[Category]
           ,[Message]
		   ,[Details])
    OUTPUT INSERTED.[ID] INTO @InsertedRow
     VALUES
           (@CompanyIntegrationRunID,
           @CompanyIntegrationRunDetailID,
           @Code,
		   @Status,
		   @Category,
           @Message,
		   @Details)

	--Get the ID of the new ErrorLog record
  SELECT @ErrorLogID=ID FROM @InsertedRow
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityAction]
    @EntityID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(20),
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAction]
    SET 
        [EntityID] = @EntityID,
        [ActionID] = @ActionID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActions] 
                                    WHERE
                                        [ID] = @ID
                                    
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
PRINT N'Creating [__mj].[spDeleteUserApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserApplicationEntity]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateRecordChangeReplayRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordChangeReplayRun]
    @ID uniqueidentifier,
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(50),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordChangeReplayRun]
    SET 
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordChangeReplayRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap]'
GO

CREATE PROC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
(
	@EntityFieldID uniqueidentifier, 
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
PRINT N'Creating [__mj].[spUpdateEntityActionInvocationType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionInvocationType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @DisplaySequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocationType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DisplaySequence] = @DisplaySequence
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionInvocationTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCompanyIntegrationRecordMap]'
GO


CREATE PROCEDURE [__mj].[spCreateCompanyIntegrationRecordMap]
    @CompanyIntegrationID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(750),
    @EntityID uniqueidentifier,
    @EntityRecordID nvarchar(750)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[CompanyIntegrationRecordMap]
        (
            [CompanyIntegrationID],
            [ExternalSystemRecordID],
            [EntityID],
            [EntityRecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @CompanyIntegrationID,
            @ExternalSystemRecordID,
            @EntityID,
            @EntityRecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCompanyIntegrationRecordMaps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteApplicationEntity]'
GO


CREATE PROCEDURE [__mj].[spDeleteApplicationEntity]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateEntityCommunicationField]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityCommunicationField]
    @ID uniqueidentifier,
    @EntityCommunicationMessageTypeID uniqueidentifier,
    @FieldName nvarchar(500),
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationField]
    SET 
        [EntityCommunicationMessageTypeID] = @EntityCommunicationMessageTypeID,
        [FieldName] = @FieldName,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityCommunicationFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spUpdateActionCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordMergeDeletionLog]'
GO


CREATE PROCEDURE [__mj].[spCreateRecordMergeDeletionLog]
    @RecordMergeLogID uniqueidentifier,
    @DeletedRecordID nvarchar(750),
    @Status nvarchar(10),
    @ProcessingLog nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecordMergeDeletionLog]
        (
            [RecordMergeLogID],
            [DeletedRecordID],
            [Status],
            [ProcessingLog]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @RecordMergeLogID,
            @DeletedRecordID,
            @Status,
            @ProcessingLog
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordMergeDeletionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityPermission]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityPermission]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateEntityCommunicationMessageType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityCommunicationMessageType]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @BaseMessageTypeID uniqueidentifier,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationMessageType]
    SET 
        [EntityID] = @EntityID,
        [BaseMessageTypeID] = @BaseMessageTypeID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityCommunicationMessageTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
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
	ON i.ID = ci.IntegrationID
WHERE 
	i.Name = @IntegrationName
	AND ci.ExternalSystemID = @ExternalSystemID
	AND ci.IsActive = 1
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionAuthorization]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionAuthorization]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionAuthorization]
    SET 
        [ActionID] = @ActionID,
        [AuthorizationID] = @AuthorizationID,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionAuthorizations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordMergeLog]'
GO


CREATE PROCEDURE [__mj].[spCreateRecordMergeLog]
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetime,
    @ProcessingEndedAt datetime,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwRecordMergeLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteApplication]'
GO


CREATE PROCEDURE [__mj].[spDeleteApplication]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateLibraryItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateLibraryItem]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @LibraryID uniqueidentifier,
    @Type nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[LibraryItem]
    SET 
        [Name] = @Name,
        [LibraryID] = @LibraryID,
        [Type] = @Type
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLibraryItems] 
                                    WHERE
                                        [ID] = @ID
                                    
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
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
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
INNER JOIN
  __mj.EntityField ef
  ON
  e.ID = ef.EntityID AND
  ef.Name = col.name
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityActionInvocation]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionInvocation]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier,
    @InvocationTypeID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocation]
    SET 
        [EntityActionID] = @EntityActionID,
        [InvocationTypeID] = @InvocationTypeID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionInvocations] 
                                    WHERE
                                        [ID] = @ID
                                    
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[SchemaInfo]
        (
            [SchemaName],
            [EntityIDMin],
            [EntityIDMax],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @SchemaName,
            @EntityIDMin,
            @EntityIDMax,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwSchemaInfos] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteUserApplication]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserApplication]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateEntityRelationshipDisplayComponent]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityRelationshipDisplayComponent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @RelationshipType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationshipDisplayComponent]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [RelationshipType] = @RelationshipType
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRelationshipDisplayComponents] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntitiesWithExternalChangeTracking]'
GO

CREATE VIEW [__mj].[vwEntitiesWithExternalChangeTracking] 
AS
SELECT   
  e.* 
FROM 
  __mj.vwEntities e
WHERE
  e.TrackRecordChanges=1
  AND
    EXISTS (
		  SELECT 
			  1 
		  FROM 
			  __mj.vwEntityFields ef 
		  WHERE 
			  ef.Name='__mj_UpdatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
  AND
    EXISTS (
		  SELECT 
			  1 
		  FROM 
			  __mj.vwEntityFields ef 
		  WHERE 
			  ef.Name='__mj_CreatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueryField]'
GO


CREATE PROCEDURE [__mj].[spCreateQueryField]
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID uniqueidentifier,
    @SourceFieldName nvarchar(255),
    @IsComputed bit,
    @ComputationDescription nvarchar(MAX),
    @IsSummary bit,
    @SummaryDescription nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
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
    OUTPUT INSERTED.[ID] INTO @InsertedRow
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
    SELECT * FROM [__mj].[vwQueryFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[vwEntitiesWithMissingBaseTables]'
GO

CREATE VIEW [__mj].[vwEntitiesWithMissingBaseTables]
AS
SELECT 
    e.*
FROM 
    __mj.vwEntities e
LEFT JOIN 
    INFORMATION_SCHEMA.TABLES t
ON 
    e.SchemaName = t.TABLE_SCHEMA AND 
    e.BaseTable = t.TABLE_NAME
WHERE 
    t.TABLE_NAME IS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRecordMap]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRecordMap]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(750),
    @EntityID uniqueidentifier,
    @EntityRecordID nvarchar(750)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRecordMap]
    SET 
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [EntityID] = @EntityID,
        [EntityRecordID] = @EntityRecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrationRecordMaps] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
PRINT N'Creating [__mj].[spDeleteEntityWithCoreDependencies]'
GO

CREATE PROC [__mj].[spDeleteEntityWithCoreDependencies]
  @EntityID nvarchar(100)
AS
DELETE FROM __mj.EntityFieldValue WHERE EntityFieldID IN (SELECT ID FROM __mj.EntityField WHERE EntityID = @EntityID)
DELETE FROM __mj.EntityField WHERE EntityID = @EntityID
DELETE FROM __mj.EntityPermission WHERE EntityID = @EntityID
DELETE FROM __mj.EntityRelationship WHERE EntityID = @EntityID OR RelatedEntityID = @EntityID
DELETE FROM __mj.ApplicationEntity WHERE EntityID = @EntityID
DELETE FROM __mj.Entity WHERE ID = @EntityID
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRecordMergeDeletionLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordMergeDeletionLog]
    @ID uniqueidentifier,
    @RecordMergeLogID uniqueidentifier,
    @DeletedRecordID nvarchar(750),
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
        [ProcessingLog] = @ProcessingLog
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordMergeDeletionLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
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
INNER JOIN
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
PRINT N'Creating [__mj].[spUpdateRecordMergeLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordMergeLog]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID uniqueidentifier,
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
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordMergeLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwListDetails]'
GO


CREATE VIEW [__mj].[vwListDetails]
AS
SELECT 
    l.*,
    List_ListID.[Name] AS [List]
FROM
    [__mj].[ListDetail] AS l
INNER JOIN
    [__mj].[List] AS List_ListID
  ON
    [l].[ListID] = List_ListID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateSchemaInfo]'
GO


CREATE PROCEDURE [__mj].[spUpdateSchemaInfo]
    @ID uniqueidentifier,
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
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwSchemaInfos] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewRunDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewRunDetail]
    @UserViewRunID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserViewRunDetail]
        (
            [UserViewRunID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserViewRunID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViewRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityAction]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityAction]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueryField]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueryField]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID uniqueidentifier,
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
        [SummaryDescription] = @SummaryDescription
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueryFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserViewRun]'
GO


CREATE PROCEDURE [__mj].[spCreateUserViewRun]
    @UserViewID uniqueidentifier,
    @RunAt datetime,
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserViewRun]
        (
            [UserViewID],
            [RunAt],
            [RunByUserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserViewID,
            @RunAt,
            @RunByUserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserViewRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityActionInvocationType]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionInvocationType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityActionInvocationType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCompanyIntegrationRunAPILog]'
GO


CREATE PROCEDURE [__mj].[spUpdateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrationRunAPILogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionCategory]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionCategory]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateListDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateListDetail]
    @ListID uniqueidentifier,
    @RecordID nvarchar(445),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ListDetail]
        (
            [ListID],
            [RecordID],
            [Sequence]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ListID,
            @RecordID,
            @Sequence
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwListDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionAuthorization]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionAuthorization]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionAuthorization]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateList]'
GO


CREATE PROCEDURE [__mj].[spCreateList]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[List]
        (
            [Name],
            [Description],
            [EntityID],
            [UserID],
            [CategoryID],
            [ExternalSystemRecordID],
            [CompanyIntegrationID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @EntityID,
            @UserID,
            @CategoryID,
            @ExternalSystemRecordID,
            @CompanyIntegrationID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityActionInvocation]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionInvocation]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityActionInvocation]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserViewRunDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserViewRunDetail]
    @ID uniqueidentifier,
    @UserViewRunID uniqueidentifier,
    @RecordID nvarchar(450)
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserViewRunDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityActionParams]'
GO


CREATE VIEW [__mj].[vwEntityActionParams]
AS
SELECT 
    e.*,
    ActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [__mj].[EntityActionParam] AS e
INNER JOIN
    [__mj].[ActionParam] AS ActionParam_ActionParamID
  ON
    [e].[ActionParamID] = ActionParam_ActionParamID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionFilters]'
GO


CREATE VIEW [__mj].[vwActionFilters]
AS
SELECT 
    a.*
FROM
    [__mj].[ActionFilter] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateUserViewRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateUserViewRun]
    @ID uniqueidentifier,
    @UserViewID uniqueidentifier,
    @RunAt datetime,
    @RunByUserID uniqueidentifier
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserViewRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionResultCodes]'
GO


CREATE VIEW [__mj].[vwActionResultCodes]
AS
SELECT 
    a.*,
    Action_ActionID.[Name] AS [Action]
FROM
    [__mj].[ActionResultCode] AS a
INNER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwQueryCategories]'
GO


CREATE VIEW [__mj].[vwQueryCategories]
AS
SELECT 
    q.*,
    QueryCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [__mj].[QueryCategory] AS q
LEFT OUTER JOIN
    [__mj].[QueryCategory] AS QueryCategory_ParentID
  ON
    [q].[ParentID] = QueryCategory_ParentID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [q].[UserID] = User_UserID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActions]'
GO


CREATE VIEW [__mj].[vwActions]
AS
SELECT 
    a.*,
    ActionCategory_CategoryID.[Name] AS [Category],
    User_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser]
FROM
    [__mj].[Action] AS a
LEFT OUTER JOIN
    [__mj].[ActionCategory] AS ActionCategory_CategoryID
  ON
    [a].[CategoryID] = ActionCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [__mj].[User] AS User_CodeApprovedByUserID
  ON
    [a].[CodeApprovedByUserID] = User_CodeApprovedByUserID.[ID]
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
PRINT N'Creating [__mj].[spUpdateListDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateListDetail]
    @ID uniqueidentifier,
    @ListID uniqueidentifier,
    @RecordID nvarchar(445),
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
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwListDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityActionFilters]'
GO


CREATE VIEW [__mj].[vwEntityActionFilters]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityActionFilter] AS e
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
PRINT N'Creating [__mj].[spUpdateList]'
GO


CREATE PROCEDURE [__mj].[spUpdateList]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID uniqueidentifier
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
        [CategoryID] = @CategoryID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [CompanyIntegrationID] = @CompanyIntegrationID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLists] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwActionContextTypes]'
GO


CREATE VIEW [__mj].[vwActionContextTypes]
AS
SELECT 
    a.*
FROM
    [__mj].[ActionContextType] AS a
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
PRINT N'Creating [__mj].[spCreateEntityActionParam]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionParam]
    @EntityActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityActionParam]
        (
            [EntityActionID],
            [ActionParamID],
            [ValueType],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityActionID,
            @ActionParamID,
            @ValueType,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionFilter]'
GO


CREATE PROCEDURE [__mj].[spCreateActionFilter]
    @UserDescription nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionFilter]
        (
            [UserDescription],
            [UserComments],
            [Code],
            [CodeExplanation],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserDescription,
            @UserComments,
            @Code,
            @CodeExplanation,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionFilters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
PRINT N'Creating [__mj].[spCreateActionResultCode]'
GO


CREATE PROCEDURE [__mj].[spCreateActionResultCode]
    @ActionID uniqueidentifier,
    @ResultCode nvarchar(255),
    @IsSuccess bit,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionResultCode]
        (
            [ActionID],
            [ResultCode],
            [IsSuccess],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @ResultCode,
            @IsSuccess,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionResultCodes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueryCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateQueryCategory]
    @Name nvarchar(50),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[QueryCategory]
        (
            [Name],
            [ParentID],
            [Description],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @ParentID,
            @Description,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueryCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAction]'
GO


CREATE PROCEDURE [__mj].[spCreateAction]
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetime,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Action]
        (
            [CategoryID],
            [Name],
            [Description],
            [Type],
            [UserPrompt],
            [UserComments],
            [Code],
            [CodeComments],
            [CodeApprovalStatus],
            [CodeApprovalComments],
            [CodeApprovedByUserID],
            [CodeApprovedAt],
            [CodeLocked],
            [ForceCodeGeneration],
            [RetentionPeriod],
            [Status],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @CategoryID,
            @Name,
            @Description,
            @Type,
            @UserPrompt,
            @UserComments,
            @Code,
            @CodeComments,
            @CodeApprovalStatus,
            @CodeApprovalComments,
            @CodeApprovedByUserID,
            @CodeApprovedAt,
            @CodeLocked,
            @ForceCodeGeneration,
            @RetentionPeriod,
            @Status,
            GETUTCDATE(),
            GETUTCDATE()
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQueryPermission]'
GO


CREATE PROCEDURE [__mj].[spCreateQueryPermission]
    @QueryID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[QueryPermission]
        (
            [QueryID],
            [RoleID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @QueryID,
            @RoleID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueryPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityActionFilter]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionFilter]
    @EntityActionID uniqueidentifier,
    @ActionFilterID uniqueidentifier,
    @Sequence int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityActionFilter]
        (
            [EntityActionID],
            [ActionFilterID],
            [Sequence],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityActionID,
            @ActionFilterID,
            @Sequence,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionFilters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateQuery]'
GO


CREATE PROCEDURE [__mj].[spCreateQuery]
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[Query]
        (
            [Name],
            [CategoryID],
            [UserQuestion],
            [Description],
            [SQL],
            [TechnicalDescription],
            [OriginalSQL],
            [Feedback],
            [Status],
            [QualityRank],
            [ExecutionCostRank]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @CategoryID,
            @UserQuestion,
            @Description,
            @SQL,
            @TechnicalDescription,
            @OriginalSQL,
            @Feedback,
            @Status,
            @QualityRank,
            @ExecutionCostRank
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteList]'
GO


CREATE PROCEDURE [__mj].[spDeleteList]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateActionContextType]'
GO


CREATE PROCEDURE [__mj].[spCreateActionContextType]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ActionContextType]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionContextTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[EntityDocumentType]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteListDetail]'
GO


CREATE PROCEDURE [__mj].[spDeleteListDetail]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spUpdateEntityActionParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionParam]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionParam]
    SET 
        [EntityActionID] = @EntityActionID,
        [ActionParamID] = @ActionParamID,
        [ValueType] = @ValueType,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionResultCode]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionResultCode]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @ResultCode nvarchar(255),
    @IsSuccess bit,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        [ActionID] = @ActionID,
        [ResultCode] = @ResultCode,
        [IsSuccess] = @IsSuccess,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionResultCodes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateVectorIndex]'
GO


CREATE PROCEDURE [__mj].[spCreateVectorIndex]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID uniqueidentifier,
    @EmbeddingModelID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[VectorIndex]
        (
            [Name],
            [Description],
            [VectorDatabaseID],
            [EmbeddingModelID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @VectorDatabaseID,
            @EmbeddingModelID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwVectorIndexes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
PRINT N'Creating [__mj].[spUpdateActionFilter]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionFilter]
    @ID uniqueidentifier,
    @UserDescription nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionFilter]
    SET 
        [UserDescription] = @UserDescription,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeExplanation] = @CodeExplanation
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionFilters] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueryCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueryCategory]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryCategory]
    SET 
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueryCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwUserRoles]'
GO


CREATE VIEW [__mj].[vwUserRoles]
AS
SELECT 
    u.*,
    User_UserID.[Name] AS [User],
    Role_RoleID.[Name] AS [Role]
FROM
    [__mj].[UserRole] AS u
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
INNER JOIN
    [__mj].[Role] AS Role_RoleID
  ON
    [u].[RoleID] = Role_RoleID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityActionParam]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionParam]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityActionParam]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateAction]
    @ID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetime,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Action]
    SET 
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [CodeLocked] = @CodeLocked,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQueryPermission]'
GO


CREATE PROCEDURE [__mj].[spUpdateQueryPermission]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryPermission]
    SET 
        [QueryID] = @QueryID,
        [RoleID] = @RoleID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueryPermissions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityActionFilter]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionFilter]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier,
    @ActionFilterID uniqueidentifier,
    @Sequence int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionFilter]
    SET 
        [EntityActionID] = @EntityActionID,
        [ActionFilterID] = @ActionFilterID,
        [Sequence] = @Sequence,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionFilters] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateQuery]'
GO


CREATE PROCEDURE [__mj].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Query]
    SET 
        [Name] = @Name,
        [CategoryID] = @CategoryID,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkflowRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkflowRun]
    @ID uniqueidentifier,
    @WorkflowID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(500),
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
        [WorkflowID] = @WorkflowID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [Results] = @Results
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkflowRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionContextType]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionContextType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContextType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionContextTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityDocumentType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocumentType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocumentTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkflow]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkflow]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @WorkflowEngineID uniqueidentifier,
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
        [WorkflowEngineID] = @WorkflowEngineID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [AutoRunEnabled] = @AutoRunEnabled,
        [AutoRunIntervalUnits] = @AutoRunIntervalUnits,
        [AutoRunInterval] = @AutoRunInterval,
        [SubclassName] = @SubclassName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkflows] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwflyway_schema_histories]'
GO


CREATE VIEW [__mj].[vwflyway_schema_histories]
AS
SELECT 
    f.*
FROM
    [__mj].[flyway_schema_history] AS f
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateVectorIndex]'
GO


CREATE PROCEDURE [__mj].[spUpdateVectorIndex]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID uniqueidentifier,
    @EmbeddingModelID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorIndex]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [VectorDatabaseID] = @VectorDatabaseID,
        [EmbeddingModelID] = @EmbeddingModelID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwVectorIndexes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateWorkflowEngine]'
GO


CREATE PROCEDURE [__mj].[spUpdateWorkflowEngine]
    @ID uniqueidentifier,
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
        [DriverClass] = @DriverClass
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkflowEngines] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserRole]'
GO


CREATE PROCEDURE [__mj].[spCreateUserRole]
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[UserRole]
        (
            [UserID],
            [RoleID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @RoleID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserRoles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecordChange]'
GO


CREATE PROCEDURE [__mj].[spCreateRecordChange]
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @UserID uniqueidentifier,
    @Type nvarchar(20),
    @Source nvarchar(20),
    @ChangedAt datetimeoffset,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nvarchar(50),
    @ErrorLog nvarchar(MAX),
    @ReplayRunID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecordChange]
        (
            [EntityID],
            [RecordID],
            [UserID],
            [Type],
            [Source],
            [ChangedAt],
            [ChangesJSON],
            [ChangesDescription],
            [FullRecordJSON],
            [Status],
            [ErrorLog],
            [ReplayRunID],
            [IntegrationID],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @RecordID,
            @UserID,
            @Type,
            @Source,
            @ChangedAt,
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @ErrorLog,
            @ReplayRunID,
            @IntegrationID,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecordChanges] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateScheduledAction]'
GO


CREATE PROCEDURE [__mj].[spCreateScheduledAction]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CreatedByUserID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Type nvarchar(20),
    @CronExpression nvarchar(100),
    @Timezone nvarchar(100),
    @Status nvarchar(20),
    @IntervalDays int,
    @DayOfWeek nvarchar(20),
    @DayOfMonth int,
    @Month nvarchar(20),
    @CustomCronExpression nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ScheduledAction]
        (
            [Name],
            [Description],
            [CreatedByUserID],
            [ActionID],
            [Type],
            [CronExpression],
            [Timezone],
            [Status],
            [IntervalDays],
            [DayOfWeek],
            [DayOfMonth],
            [Month],
            [CustomCronExpression]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CreatedByUserID,
            @ActionID,
            @Type,
            @CronExpression,
            @Timezone,
            @Status,
            @IntervalDays,
            @DayOfWeek,
            @DayOfMonth,
            @Month,
            @CustomCronExpression
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwScheduledActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateflyway_schema_history]'
GO


CREATE PROCEDURE [__mj].[spCreateflyway_schema_history]
    @installed_rank int,
    @version nvarchar(50),
    @description nvarchar(200),
    @type nvarchar(20),
    @script nvarchar(1000),
    @checksum int,
    @installed_by nvarchar(100),
    @installed_on datetime,
    @execution_time int,
    @success bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[flyway_schema_history]
        (
            [version],
            [description],
            [type],
            [script],
            [checksum],
            [installed_by],
            [installed_on],
            [execution_time],
            [success]
        )
    VALUES
        (
            @version,
            @description,
            @type,
            @script,
            @checksum,
            @installed_by,
            @installed_on,
            @execution_time,
            @success
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwflyway_schema_histories] WHERE [installed_rank] = @installed_rank
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionResultCode]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionResultCode]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionResultCode]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateScheduledActionParam]'
GO


CREATE PROCEDURE [__mj].[spCreateScheduledActionParam]
    @ScheduledActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ScheduledActionParam]
        (
            [ScheduledActionID],
            [ActionParamID],
            [ValueType],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ScheduledActionID,
            @ActionParamID,
            @ValueType,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwScheduledActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionFilter]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionFilter]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionFilter]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteQueryCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteQueryCategory]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spDeleteUserRole]'
GO


CREATE PROCEDURE [__mj].[spDeleteUserRole]
    @ID uniqueidentifier
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
PRINT N'Creating [__mj].[spCreateExplorerNavigationItem]'
GO


CREATE PROCEDURE [__mj].[spCreateExplorerNavigationItem]
    @Sequence int,
    @Name nvarchar(100),
    @Route nvarchar(255),
    @IsActive bit,
    @ShowInHomeScreen bit,
    @ShowInNavigationDrawer bit,
    @IconCSSClass nvarchar(100),
    @Description nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[ExplorerNavigationItem]
        (
            [Sequence],
            [Name],
            [Route],
            [IsActive],
            [ShowInHomeScreen],
            [ShowInNavigationDrawer],
            [IconCSSClass],
            [Description],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Sequence,
            @Name,
            @Route,
            @IsActive,
            @ShowInHomeScreen,
            @ShowInNavigationDrawer,
            @IconCSSClass,
            @Description,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwExplorerNavigationItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteAction]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[Action]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateRecordChange]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecordChange]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @UserID uniqueidentifier,
    @Type nvarchar(20),
    @Source nvarchar(20),
    @ChangedAt datetimeoffset,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nvarchar(50),
    @ErrorLog nvarchar(MAX),
    @ReplayRunID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordChange]
    SET 
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UserID] = @UserID,
        [Type] = @Type,
        [Source] = @Source,
        [ChangedAt] = @ChangedAt,
        [ChangesJSON] = @ChangesJSON,
        [ChangesDescription] = @ChangesDescription,
        [FullRecordJSON] = @FullRecordJSON,
        [Status] = @Status,
        [ErrorLog] = @ErrorLog,
        [ReplayRunID] = @ReplayRunID,
        [IntegrationID] = @IntegrationID,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordChanges] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityActionFilter]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionFilter]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityActionFilter]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwAuthorizations]'
GO


CREATE VIEW [__mj].[vwAuthorizations]
AS
SELECT 
    a.*,
    Authorization_ParentID.[Name] AS [Parent]
FROM
    [__mj].[Authorization] AS a
LEFT OUTER JOIN
    [__mj].[Authorization] AS Authorization_ParentID
  ON
    [a].[ParentID] = Authorization_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateflyway_schema_history]'
GO


CREATE PROCEDURE [__mj].[spUpdateflyway_schema_history]
    @installed_rank int,
    @version nvarchar(50),
    @description nvarchar(200),
    @type nvarchar(20),
    @script nvarchar(1000),
    @checksum int,
    @installed_by nvarchar(100),
    @installed_on datetime,
    @execution_time int,
    @success bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[flyway_schema_history]
    SET 
        [version] = @version,
        [description] = @description,
        [type] = @type,
        [script] = @script,
        [checksum] = @checksum,
        [installed_by] = @installed_by,
        [installed_on] = @installed_on,
        [execution_time] = @execution_time,
        [success] = @success
    WHERE
        [installed_rank] = @installed_rank

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwflyway_schema_histories] 
                                    WHERE
                                        [installed_rank] = @installed_rank
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionContextType]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionContextType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ActionContextType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
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
PRINT N'Creating [__mj].[CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns]'
GO

CREATE PROCEDURE [__mj].[CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns]
    @SchemaName NVARCHAR(255),
    @TableName NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @sql NVARCHAR(MAX);
    DECLARE @constraintName NVARCHAR(255);

    BEGIN TRY
        -- Construct the SQL command for updating the columns
        SET @sql = 'UPDATE [' + @SchemaName + '].[' + @TableName + '] SET __mj_CreatedAt = CreatedAt, __mj_UpdatedAt = UpdatedAt;';
        EXEC sp_executesql @sql;

        -- Drop default constraint on CreatedAt
        SELECT @constraintName = d.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON t.object_id = c.object_id
        JOIN sys.default_constraints d ON c.default_object_id = d.object_id
        WHERE s.name = @SchemaName 
        AND t.name = @TableName 
        AND c.name = 'CreatedAt';
        
        IF @constraintName IS NOT NULL
        BEGIN
            SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT ' + @constraintName + ';';
            EXEC sp_executesql @sql;
        END

        -- Drop default constraint on UpdatedAt
        SELECT @constraintName = d.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON t.object_id = c.object_id
        JOIN sys.default_constraints d ON c.default_object_id = d.object_id
        WHERE s.name = @SchemaName 
        AND t.name = @TableName 
        AND c.name = 'UpdatedAt';
        
        IF @constraintName IS NOT NULL
        BEGIN
            SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT ' + @constraintName + ';';
            EXEC sp_executesql @sql;
        END

        -- Construct the SQL command for dropping the old columns
        SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP COLUMN CreatedAt, UpdatedAt;';
        EXEC sp_executesql @sql;

        PRINT 'Finished Updating ' + @SchemaName + '.' + @TableName + ' below is the new data for that table'

        SET @sql = 'SELECT * FROM [' + @SchemaName + '].[' + @TableName + '];';
        EXEC sp_executesql @sql;
    END TRY
    BEGIN CATCH
        -- Error handling
        DECLARE @ErrorMessage NVARCHAR(4000);
        DECLARE @ErrorSeverity INT;
        DECLARE @ErrorState INT;

        SELECT 
            @ErrorMessage = ERROR_MESSAGE(),
            @ErrorSeverity = ERROR_SEVERITY(),
            @ErrorState = ERROR_STATE();

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityBehaviorType]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityBehaviorType]
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityBehaviorType]
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
    SELECT * FROM [__mj].[vwEntityBehaviorTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityBehavior]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityBehavior]
    @EntityID int,
    @BehaviorTypeID int,
    @Description nvarchar(MAX),
    @RegenerateCode bit,
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX),
    @CodeGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityBehavior]
        (
            [EntityID],
            [BehaviorTypeID],
            [Description],
            [RegenerateCode],
            [Code],
            [CodeExplanation],
            [CodeGenerated]
        )
    VALUES
        (
            @EntityID,
            @BehaviorTypeID,
            @Description,
            @RegenerateCode,
            @Code,
            @CodeExplanation,
            @CodeGenerated
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityBehaviors] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityBehaviorType]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityBehaviorType]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityBehaviorType]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityBehavior]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityBehavior]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityBehavior]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
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
PRINT N'Creating [__mj].[spUpdateEntityBehaviorType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityBehaviorType]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehaviorType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityBehaviorTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityBehavior]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityBehavior]
    @ID int,
    @EntityID int,
    @BehaviorTypeID int,
    @Description nvarchar(MAX),
    @RegenerateCode bit,
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX),
    @CodeGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehavior]
    SET 
        [EntityID] = @EntityID,
        [BehaviorTypeID] = @BehaviorTypeID,
        [Description] = @Description,
        [RegenerateCode] = @RegenerateCode,
        [Code] = @Code,
        [CodeExplanation] = @CodeExplanation,
        [CodeGenerated] = @CodeGenerated
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityBehaviors] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ActionCategory]'
GO
ALTER TABLE [__mj].[ActionCategory] ADD CONSTRAINT [CK__ActionCat__Statu__6E9A7E87] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [CK__ActionCon__Statu__13CC0336] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [CK__ActionPara__Type__6F64858E] CHECK (([Type]='Both' OR [Type]='Output' OR [Type]='Input'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [CK_ValueType] CHECK (([ValueType]='Other' OR [ValueType]='BaseEntity Sub-Class' OR [ValueType]='Simple Object' OR [ValueType]='Scalar'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [CK__ActionPar__Value__7058A9C7] CHECK (([ValueType]='Other' OR [ValueType]='BaseEntity Sub-Class' OR [ValueType]='Simple Object' OR [ValueType]='Scalar'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [CHK_Action_Type] CHECK (([Type]='Custom' OR [Type]='Generated'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [CK__Action__CodeAppr__75477C16] CHECK (([CodeApprovalStatus]='Rejected' OR [CodeApprovalStatus]='Approved' OR [CodeApprovalStatus]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [CK__Action__Status__772FC488] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
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
PRINT N'Adding constraints to [__mj].[CommunicationLog]'
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [CK__Communica__Direc__0284A8FF] CHECK (([Direction]='Receiving' OR [Direction]='Sending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [CK__Communica__Statu__0378CD38] CHECK (([Status]='Failed' OR [Status]='Complete' OR [Status]='In-Progress' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationProviderMessageType]'
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] ADD CONSTRAINT [CK__Communica__Statu__7065F8C4] CHECK (([Status]='Active' OR [Status]='Disabled'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] ADD CONSTRAINT [CK__Communica__Statu__6123B534] CHECK (([Status]='Active' OR [Status]='Disabled'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationRun]'
GO
ALTER TABLE [__mj].[CommunicationRun] ADD CONSTRAINT [CK__Communica__Direc__7BD7AB70] CHECK (([Direction]='Receiving' OR [Direction]='Sending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationRun] ADD CONSTRAINT [CK__Communica__Statu__7CCBCFA9] CHECK (([Status]='Failed' OR [Status]='Complete' OR [Status]='In-Progress' OR [Status]='Pending'))
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
PRINT N'Adding constraints to [__mj].[DuplicateRunDetailMatch]'
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [CHK_MatchSource] CHECK (([MatchSource]='SP' OR [MatchSource]='Vector'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [CHK_DRDM_ApprovalStatus] CHECK (([ApprovalStatus]='Rejected' OR [ApprovalStatus]='Approved' OR [ApprovalStatus]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [CHK_DRDM_MergeStatus] CHECK (([MergeStatus]='Error' OR [MergeStatus]='Complete' OR [MergeStatus]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[DuplicateRunDetail]'
GO
ALTER TABLE [__mj].[DuplicateRunDetail] ADD CONSTRAINT [CHK_MatchStatus] CHECK (([MatchStatus]='Error' OR [MatchStatus]='Skipped' OR [MatchStatus]='Complete' OR [MatchStatus]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRunDetail] ADD CONSTRAINT [CHK_MergeStatus] CHECK (([MergeStatus]='Error' OR [MergeStatus]='Complete' OR [MergeStatus]='Pending' OR [MergeStatus]='Not Applicable'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[DuplicateRun]'
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [CHK_ApprovalStatus] CHECK (([ApprovalStatus]='Rejected' OR [ApprovalStatus]='Approved' OR [ApprovalStatus]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [CHK_ProcessingStatus] CHECK (([ProcessingStatus]='Failed' OR [ProcessingStatus]='Complete' OR [ProcessingStatus]='In Progress' OR [ProcessingStatus]='Pending'))
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
PRINT N'Adding constraints to [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [CK__EntityAct__Statu__26DED7AA] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityActionInvocation]'
GO
ALTER TABLE [__mj].[EntityActionInvocation] ADD CONSTRAINT [CK__EntityAct__Statu__32508A56] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityActionParam]'
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [CHK_EntityActionParam_ValueType] CHECK (([ValueType]='Script' OR [ValueType]='Entity Object' OR [ValueType]='Entity Field' OR [ValueType]='Static'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [CK__EntityAct__Statu__1F3DB5E2] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
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
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [CHK_MatchThresholds] CHECK (([PotentialMatchThreshold]<=[AbsoluteMatchThreshold] AND [PotentialMatchThreshold]>=(0) AND [PotentialMatchThreshold]<=(1) AND [AbsoluteMatchThreshold]>=(0) AND [AbsoluteMatchThreshold]<=(1)))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_EntityField_ValueListType] CHECK (([ValueListType]='None' OR [ValueListType]='List' OR [ValueListType]='ListOrUserEntry'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_ValueListType] CHECK (([ValueListType]='ListOrUserEntry' OR [ValueListType]='List' OR [ValueListType]='None'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_EntityField_ExtendedType] CHECK (([ExtendedType]='Other' OR [ExtendedType]='ZoomMtg' OR [ExtendedType]='MSTeams' OR [ExtendedType]='SIP' OR [ExtendedType]='Skype' OR [ExtendedType]='FaceTime' OR [ExtendedType]='WhatsApp' OR [ExtendedType]='Geo' OR [ExtendedType]='SMS' OR [ExtendedType]='Tel' OR [ExtendedType]='Code' OR [ExtendedType]='URL' OR [ExtendedType]='Email'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_EntityField_CodeType] CHECK (([CodeType]='Other' OR [CodeType]='JavaScript' OR [CodeType]='CSS' OR [CodeType]='HTML' OR [CodeType]='SQL' OR [CodeType]='TypeScript'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_GeneratedFormSection] CHECK (([GeneratedFormSection]='Details' OR [GeneratedFormSection]='Category' OR [GeneratedFormSection]='Top'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationshipDisplayComponent]'
GO
ALTER TABLE [__mj].[EntityRelationshipDisplayComponent] ADD CONSTRAINT [CHK_EntityRelationshipDisplayComponent_RelationshipType] CHECK (([RelationshipType]='Both' OR [RelationshipType]='Many to Many' OR [RelationshipType]='One to Many'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_Type] CHECK (([Type]='One To Many' OR [Type]='Many To Many'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_DisplayLocation] CHECK (([DisplayLocation]='Before Field Tabs' OR [DisplayLocation]='After Field Tabs'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_DisplayIconType] CHECK (([DisplayIconType]='None' OR [DisplayIconType]='Custom' OR [DisplayIconType]='Related Entity Icon'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [CK_Entity_DeleteType] CHECK (([DeleteType]='Soft' OR [DeleteType]='Hard'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [CHK_RelationshipDefaultDisplayType] CHECK (([RelationshipDefaultDisplayType]='Dropdown' OR [RelationshipDefaultDisplayType]='Search'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [CK_Entity_AllowRecordMerge] CHECK (([AllowRecordMerge]=(0) OR [AllowRecordMerge]=(1) AND [AllowDeleteAPI]=(1) AND [DeleteType]='Soft'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ExplorerNavigationItem]'
GO
ALTER TABLE [__mj].[ExplorerNavigationItem] ADD CONSTRAINT [CK__ExplorerN__Seque__03CD6B30] CHECK (([Sequence]>(0)))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[LibraryItem]'
GO
ALTER TABLE [__mj].[LibraryItem] ADD CONSTRAINT [CK__LibraryIte__Type__4264C653] CHECK (([Type]='Function' OR [Type]='Variable' OR [Type]='Module' OR [Type]='Type' OR [Type]='Interface' OR [Type]='Class'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] ADD CONSTRAINT [CK__Library__Status__74FE2EAA] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
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
PRINT N'Adding constraints to [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] ADD CONSTRAINT [CK__Recommend__Match__7CA34925] CHECK (([MatchProbability]>=(0) AND [MatchProbability]<=(1)))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecommendationRun]'
GO
ALTER TABLE [__mj].[RecommendationRun] ADD CONSTRAINT [CHK_RecommendationRun_Status] CHECK (([Status]='Error' OR [Status]='Canceled' OR [Status]='Completed' OR [Status]='In Progress' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChangeReplayRun]'
GO
ALTER TABLE [__mj].[RecordChangeReplayRun] ADD CONSTRAINT [CK__RecordCha__Statu__3281CD97] CHECK (([Status]='Error' OR [Status]='Complete' OR [Status]='In Progress' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CHK_RecordChange_Type] CHECK (([Type]='Delete' OR [Type]='Update' OR [Type]='Create'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CHK_RecordChange_Source] CHECK (([Source]='External' OR [Source]='Internal'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CK_RecordChange_Status] CHECK (([Status]='Error' OR [Status]='Complete' OR [Status]='Pending'))
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
PRINT N'Adding constraints to [__mj].[ScheduledActionParam]'
GO
ALTER TABLE [__mj].[ScheduledActionParam] ADD CONSTRAINT [CK__Scheduled__Value__7979F9EF] CHECK (([ValueType]='SQL Statement' OR [ValueType]='Static'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ScheduledAction]'
GO
ALTER TABLE [__mj].[ScheduledAction] ADD CONSTRAINT [CK_ScheduledAction_Type] CHECK (([Type]='Custom' OR [Type]='Yearly' OR [Type]='Monthly' OR [Type]='Weekly' OR [Type]='Daily'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[ScheduledAction] ADD CONSTRAINT [CK_ScheduledAction_Status] CHECK (([Status]='Expired' OR [Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
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
PRINT N'Adding constraints to [__mj].[TemplateContentType]'
GO
ALTER TABLE [__mj].[TemplateContentType] ADD CONSTRAINT [CK_TemplateContentType_CodeType] CHECK (([CodeType]='Other' OR [CodeType]='JSON' OR [CodeType]='JavaScript' OR [CodeType]='CSS' OR [CodeType]='HTML' OR [CodeType]='SQL' OR [CodeType]='TypeScript'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] ADD CONSTRAINT [CK__TemplatePa__Type__4B6027F5] CHECK (([Type]='Record' OR [Type]='Entity' OR [Type]='Object' OR [Type]='Array' OR [Type]='Scalar'))
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
PRINT N'Adding foreign keys to [__mj].[ActionAuthorization]'
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD CONSTRAINT [FK__ActionAut__Actio__7FC50A89] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD CONSTRAINT [FK_ActionAuthorization_Authorization] FOREIGN KEY ([AuthorizationID]) REFERENCES [__mj].[Authorization] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionCategory]'
GO
ALTER TABLE [__mj].[ActionCategory] ADD CONSTRAINT [FK_ActionCategory_ActionCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[ActionCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [FK__ActionCon__Actio__16A86FE1] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [FK_ActionContext_ActionContextType] FOREIGN KEY ([ContextTypeID]) REFERENCES [__mj].[ActionContextType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionExecutionLog]'
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD CONSTRAINT [FK_ActionExecutionLog_Action] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD CONSTRAINT [FK_ActionExecutionLog_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionLibrary]'
GO
ALTER TABLE [__mj].[ActionLibrary] ADD CONSTRAINT [FK_ActionLibrary_Action] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionLibrary] ADD CONSTRAINT [FK_ActionLibrary_Library] FOREIGN KEY ([LibraryID]) REFERENCES [__mj].[Library] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [FK_ActionParam_Action] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionResultCode]'
GO
ALTER TABLE [__mj].[ActionResultCode] ADD CONSTRAINT [FK__ActionRes__Actio__4192CDE6] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [FK__Action__CodeAppr__7B00556C] FOREIGN KEY ([CodeApprovedByUserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [FK_Action_ActionCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[ActionCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [FK_ApplicationEntity_Application] FOREIGN KEY ([ApplicationID]) REFERENCES [__mj].[Application] ([ID])
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [FK_ApplicationEntity_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ApplicationSetting]'
GO
ALTER TABLE [__mj].[ApplicationSetting] ADD CONSTRAINT [FK_ApplicationSetting_Application] FOREIGN KEY ([ApplicationID]) REFERENCES [__mj].[Application] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AuditLogType]'
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [FK_AuditLogType_Authorization] FOREIGN KEY ([AuthorizationID]) REFERENCES [__mj].[Authorization] ([ID])
GO
ALTER TABLE [__mj].[AuditLogType] ADD CONSTRAINT [FK_AuditLogType_ParentID] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[AuditLogType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AuditLog]'
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_AuditLogType] FOREIGN KEY ([AuditLogTypeID]) REFERENCES [__mj].[AuditLogType] ([ID])
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_Authorization] FOREIGN KEY ([AuthorizationID]) REFERENCES [__mj].[Authorization] ([ID])
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[AuditLog] ADD CONSTRAINT [FK_AuditLog_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[AuthorizationRole]'
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [FK_AuthorizationRole_Authorization] FOREIGN KEY ([AuthorizationID]) REFERENCES [__mj].[Authorization] ([ID])
GO
ALTER TABLE [__mj].[AuthorizationRole] ADD CONSTRAINT [FK_AuthorizationRole_Role1] FOREIGN KEY ([RoleID]) REFERENCES [__mj].[Role] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Authorization]'
GO
ALTER TABLE [__mj].[Authorization] ADD CONSTRAINT [FK_Authorization_Authorization] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[Authorization] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CommunicationLog]'
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [FK__Communica__Commu__065539E3] FOREIGN KEY ([CommunicationProviderID]) REFERENCES [__mj].[CommunicationProvider] ([ID])
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [FK__Communica__Commu__07495E1C] FOREIGN KEY ([CommunicationProviderMessageTypeID]) REFERENCES [__mj].[CommunicationProviderMessageType] ([ID])
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [FK__Communica__Commu__083D8255] FOREIGN KEY ([CommunicationRunID]) REFERENCES [__mj].[CommunicationRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CommunicationProviderMessageType]'
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] ADD CONSTRAINT [FK__Communica__Commu__7342656F] FOREIGN KEY ([CommunicationProviderID]) REFERENCES [__mj].[CommunicationProvider] ([ID])
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] ADD CONSTRAINT [FK__Communica__Commu__743689A8] FOREIGN KEY ([CommunicationBaseMessageTypeID]) REFERENCES [__mj].[CommunicationBaseMessageType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[CommunicationRun]'
GO
ALTER TABLE [__mj].[CommunicationRun] ADD CONSTRAINT [FK__Communica__UserI__7FA83C54] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[CompanyIntegration] ADD CONSTRAINT [FK_CompanyIntegration_Company] FOREIGN KEY ([CompanyID]) REFERENCES [__mj].[Company] ([ID])
GO
ALTER TABLE [__mj].[CompanyIntegration] ADD CONSTRAINT [FK_CompanyIntegration_Integration] FOREIGN KEY ([IntegrationID]) REFERENCES [__mj].[Integration] ([ID])
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
ALTER TABLE [__mj].[Conversation] ADD CONSTRAINT [FK_Conversation_DataContext] FOREIGN KEY ([DataContextID]) REFERENCES [__mj].[DataContext] ([ID])
GO
ALTER TABLE [__mj].[Conversation] ADD CONSTRAINT [FK_Conversation_Entity] FOREIGN KEY ([LinkedEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DashboardCategory]'
GO
ALTER TABLE [__mj].[DashboardCategory] ADD CONSTRAINT [FK_DashboardCategory_DashboardCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[DashboardCategory] ([ID])
GO
ALTER TABLE [__mj].[DashboardCategory] ADD CONSTRAINT [FK_DashboardCategory_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[DatasetItem] ADD CONSTRAINT [FK_DatasetItem_Dataset] FOREIGN KEY ([DatasetID]) REFERENCES [__mj].[Dataset] ([ID])
GO
ALTER TABLE [__mj].[DatasetItem] ADD CONSTRAINT [FK_DatasetItem_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DuplicateRunDetailMatch]'
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [FK_DuplicateRunDetailMatch_DuplicateRunDetail] FOREIGN KEY ([DuplicateRunDetailID]) REFERENCES [__mj].[DuplicateRunDetail] ([ID])
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [FK_DuplicateRunDetailMatch_RecordMergeLog] FOREIGN KEY ([RecordMergeLogID]) REFERENCES [__mj].[RecordMergeLog] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DuplicateRunDetail]'
GO
ALTER TABLE [__mj].[DuplicateRunDetail] ADD CONSTRAINT [FK_DuplicateRunDetail_DuplicateRun] FOREIGN KEY ([DuplicateRunID]) REFERENCES [__mj].[DuplicateRun] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[DuplicateRun]'
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [FK_DuplicateRun_ApprovedByUserID] FOREIGN KEY ([ApprovedByUserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [FK_DuplicateRun_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [FK_DuplicateRun_List] FOREIGN KEY ([SourceListID]) REFERENCES [__mj].[List] ([ID])
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [FK_DuplicateRun_User] FOREIGN KEY ([StartedByUserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[EmployeeRole] ADD CONSTRAINT [FK__EmployeeR__Emplo__73852659] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID])
GO
ALTER TABLE [__mj].[EmployeeRole] ADD CONSTRAINT [FK__EmployeeR__RoleI__74794A92] FOREIGN KEY ([RoleID]) REFERENCES [__mj].[Role] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EmployeeSkill]'
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD CONSTRAINT [FK__EmployeeS__Emplo__756D6ECB] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID])
GO
ALTER TABLE [__mj].[EmployeeSkill] ADD CONSTRAINT [FK_EmployeeSkill_Skill] FOREIGN KEY ([SkillID]) REFERENCES [__mj].[Skill] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Employee]'
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [FK_Employee_Company] FOREIGN KEY ([CompanyID]) REFERENCES [__mj].[Company] ([ID])
GO
ALTER TABLE [__mj].[Employee] ADD CONSTRAINT [FK_Employee_Employee] FOREIGN KEY ([SupervisorID]) REFERENCES [__mj].[Employee] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [FK__EntityAct__Entit__29BB4455] FOREIGN KEY ([EntityActionID]) REFERENCES [__mj].[EntityAction] ([ID])
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [FK_EntityActionFilter_ActionFilter] FOREIGN KEY ([ActionFilterID]) REFERENCES [__mj].[ActionFilter] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityActionInvocation]'
GO
ALTER TABLE [__mj].[EntityActionInvocation] ADD CONSTRAINT [FK__EntityAct__Entit__352CF701] FOREIGN KEY ([EntityActionID]) REFERENCES [__mj].[EntityAction] ([ID])
GO
ALTER TABLE [__mj].[EntityActionInvocation] ADD CONSTRAINT [FK__EntityAct__Invoc__36211B3A] FOREIGN KEY ([InvocationTypeID]) REFERENCES [__mj].[EntityActionInvocationType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityActionParam]'
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [FK_EntityActionParam_ActionParam] FOREIGN KEY ([ActionParamID]) REFERENCES [__mj].[ActionParam] ([ID])
GO
ALTER TABLE [__mj].[EntityActionParam] ADD CONSTRAINT [FK_EntityActionParam_EntityAction] FOREIGN KEY ([EntityActionID]) REFERENCES [__mj].[EntityAction] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [FK__EntityAct__Actio__230E46C6] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [FK__EntityAction_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityCommunicationField]'
GO
ALTER TABLE [__mj].[EntityCommunicationField] ADD CONSTRAINT [FK__EntityCom__Entit__59D9FB2C] FOREIGN KEY ([EntityCommunicationMessageTypeID]) REFERENCES [__mj].[EntityCommunicationMessageType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityCommunicationMessageType]'
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] ADD CONSTRAINT [FK__EntityCom__BaseM__3A765E6C] FOREIGN KEY ([BaseMessageTypeID]) REFERENCES [__mj].[CommunicationBaseMessageType] ([ID])
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] ADD CONSTRAINT [FK__EntityCom__Entit__39823A33] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD CONSTRAINT [FK_EntityDocumentRun_EntityDocument] FOREIGN KEY ([EntityDocumentID]) REFERENCES [__mj].[EntityDocument] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityDocumentSetting]'
GO
ALTER TABLE [__mj].[EntityDocumentSetting] ADD CONSTRAINT [FK_EntityDocumentSetting_EntityDocument] FOREIGN KEY ([EntityDocumentID]) REFERENCES [__mj].[EntityDocument] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_AIModel] FOREIGN KEY ([AIModelID]) REFERENCES [__mj].[AIModel] ([ID])
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_EntityDocumentType] FOREIGN KEY ([TypeID]) REFERENCES [__mj].[EntityDocumentType] ([ID])
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_Template] FOREIGN KEY ([TemplateID]) REFERENCES [__mj].[Template] ([ID])
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_VectorDatabase] FOREIGN KEY ([VectorDatabaseID]) REFERENCES [__mj].[VectorDatabase] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityFieldValue]'
GO
ALTER TABLE [__mj].[EntityFieldValue] ADD CONSTRAINT [FK_EntityFieldValue_EntityField] FOREIGN KEY ([EntityFieldID]) REFERENCES [__mj].[EntityField] ([ID])
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
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_RoleName] FOREIGN KEY ([RoleID]) REFERENCES [__mj].[Role] ([ID])
GO
ALTER TABLE [__mj].[EntityPermission] ADD CONSTRAINT [FK_EntityPermission_UpdateRLSFilter] FOREIGN KEY ([UpdateRLSFilterID]) REFERENCES [__mj].[RowLevelSecurityFilter] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [FK_EntityRecordDocument_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [FK_EntityRecordDocument_EntityDocument] FOREIGN KEY ([EntityDocumentID]) REFERENCES [__mj].[EntityDocument] ([ID])
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [FK_EntityRecordDocument_VectorIndexID] FOREIGN KEY ([VectorIndexID]) REFERENCES [__mj].[VectorIndex] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityRelationship]'
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_EntityID] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_EntityRelationshipDisplayComponent] FOREIGN KEY ([DisplayComponentID]) REFERENCES [__mj].[EntityRelationshipDisplayComponent] ([ID])
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_RelatedEntityID] FOREIGN KEY ([RelatedEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [FK_EntityRelationship_UserView] FOREIGN KEY ([DisplayUserViewID]) REFERENCES [__mj].[UserView] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntitySetting]'
GO
ALTER TABLE [__mj].[EntitySetting] ADD CONSTRAINT [FK_EntitySetting_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Entity]'
GO
ALTER TABLE [__mj].[Entity] ADD CONSTRAINT [FK_Entity_ParentID] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[Entity] ([ID])
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
ALTER TABLE [__mj].[IntegrationURLFormat] ADD CONSTRAINT [FK_IntegrationURLFormat_Integration] FOREIGN KEY ([IntegrationID]) REFERENCES [__mj].[Integration] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[LibraryItem]'
GO
ALTER TABLE [__mj].[LibraryItem] ADD CONSTRAINT [FK__LibraryIt__Libra__454132FE] FOREIGN KEY ([LibraryID]) REFERENCES [__mj].[Library] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ListCategory]'
GO
ALTER TABLE [__mj].[ListCategory] ADD CONSTRAINT [FK_ListCategory_ParentID] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[ListCategory] ([ID])
GO
ALTER TABLE [__mj].[ListCategory] ADD CONSTRAINT [FK_ListCategory_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[List] ADD CONSTRAINT [FK_List_ListCategory] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[ListCategory] ([ID])
GO
ALTER TABLE [__mj].[List] ADD CONSTRAINT [FK_List_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[QueryCategory]'
GO
ALTER TABLE [__mj].[QueryCategory] ADD CONSTRAINT [FK_QueryCategory_QueryCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[QueryCategory] ([ID])
GO
ALTER TABLE [__mj].[QueryCategory] ADD CONSTRAINT [FK_QueryCategory_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[QueryPermission] ADD CONSTRAINT [FK_QueryPermission_Role] FOREIGN KEY ([RoleID]) REFERENCES [__mj].[Role] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] ADD CONSTRAINT [FK_RecommendationItem_Entity] FOREIGN KEY ([DestinationEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[RecommendationItem] ADD CONSTRAINT [FK_RecommendationItem_Recommendation] FOREIGN KEY ([RecommendationID]) REFERENCES [__mj].[Recommendation] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecommendationRun]'
GO
ALTER TABLE [__mj].[RecommendationRun] ADD CONSTRAINT [FK_RecommendationRun_RecommendationProvider] FOREIGN KEY ([RecommendationProviderID]) REFERENCES [__mj].[RecommendationProvider] ([ID])
GO
ALTER TABLE [__mj].[RecommendationRun] ADD CONSTRAINT [FK_RecommendationRun_User] FOREIGN KEY ([RunByUserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Recommendation]'
GO
ALTER TABLE [__mj].[Recommendation] ADD CONSTRAINT [FK_Recommendation_RecommendationRun] FOREIGN KEY ([RecommendationRunID]) REFERENCES [__mj].[RecommendationRun] ([ID])
GO
ALTER TABLE [__mj].[Recommendation] ADD CONSTRAINT [FK_Recommendation_SourceEntity] FOREIGN KEY ([SourceEntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordChangeReplayRun]'
GO
ALTER TABLE [__mj].[RecordChangeReplayRun] ADD CONSTRAINT [FK__RecordCha__UserI__355E3A42] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_EntityID] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_IntegrationID] FOREIGN KEY ([IntegrationID]) REFERENCES [__mj].[Integration] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_ReplayRunID] FOREIGN KEY ([ReplayRunID]) REFERENCES [__mj].[RecordChangeReplayRun] ([ID])
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_UserID] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[RecordMergeLog] ADD CONSTRAINT [FK_RecordMergeLog_ApprovedByUserID] FOREIGN KEY ([ApprovedByUserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[ReportCategory] ADD CONSTRAINT [FK_ReportCategory_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[ScheduledActionParam]'
GO
ALTER TABLE [__mj].[ScheduledActionParam] ADD CONSTRAINT [FK_ScheduledActionParam_ActionParam] FOREIGN KEY ([ActionParamID]) REFERENCES [__mj].[ActionParam] ([ID])
GO
ALTER TABLE [__mj].[ScheduledActionParam] ADD CONSTRAINT [FK_ScheduledActionParam_ScheduledAction] FOREIGN KEY ([ScheduledActionID]) REFERENCES [__mj].[ScheduledAction] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ScheduledAction]'
GO
ALTER TABLE [__mj].[ScheduledAction] ADD CONSTRAINT [FK__Scheduled__Actio__4CF16C3B] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ScheduledAction] ADD CONSTRAINT [FK__Scheduled__Creat__4BFD4802] FOREIGN KEY ([CreatedByUserID]) REFERENCES [__mj].[User] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[TemplateCategory]'
GO
ALTER TABLE [__mj].[TemplateCategory] ADD CONSTRAINT [FK__TemplateC__UserI__677C785F] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[TemplateCategory] ADD CONSTRAINT [FK_TemplateCategory_TemplateCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[TemplateCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[TemplateContent]'
GO
ALTER TABLE [__mj].[TemplateContent] ADD CONSTRAINT [FK__TemplateC__Templ__37592F48] FOREIGN KEY ([TemplateID]) REFERENCES [__mj].[Template] ([ID])
GO
ALTER TABLE [__mj].[TemplateContent] ADD CONSTRAINT [FK__TemplateC__TypeI__384D5381] FOREIGN KEY ([TypeID]) REFERENCES [__mj].[TemplateContentType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] ADD CONSTRAINT [FK__TemplateP__Entit__4F30B8D9] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[TemplateParam] ADD CONSTRAINT [FK__TemplateP__Templ__4E3C94A0] FOREIGN KEY ([TemplateID]) REFERENCES [__mj].[Template] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Template]'
GO
ALTER TABLE [__mj].[Template] ADD CONSTRAINT [FK__Template__Catego__6C412D7C] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[TemplateCategory] ([ID])
GO
ALTER TABLE [__mj].[Template] ADD CONSTRAINT [FK__Template__UserID__6D3551B5] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
ALTER TABLE [__mj].[UserNotification] ADD CONSTRAINT [FK_UserNotification_ResourceType] FOREIGN KEY ([ResourceTypeID]) REFERENCES [__mj].[ResourceType] ([ID])
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
ALTER TABLE [__mj].[UserRole] ADD CONSTRAINT [FK_UserRole_RoleName] FOREIGN KEY ([RoleID]) REFERENCES [__mj].[Role] ([ID])
GO
ALTER TABLE [__mj].[UserRole] ADD CONSTRAINT [FK_UserRole_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserViewCategory]'
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [FK_UserViewCategory_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [FK_UserViewCategory_User] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
ALTER TABLE [__mj].[UserViewCategory] ADD CONSTRAINT [FK_UserViewCategory_UserViewCategory] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[UserViewCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[UserViewRunDetail]'
GO
ALTER TABLE [__mj].[UserViewRunDetail] ADD CONSTRAINT [FK_UserViewRunDetail_UserViewRunDetail] FOREIGN KEY ([UserViewRunID]) REFERENCES [__mj].[UserViewRun] ([ID])
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
ALTER TABLE [__mj].[User] ADD CONSTRAINT [FK_User_Employee] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID])
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
ALTER TABLE [__mj].[WorkflowRun] ADD CONSTRAINT [FK_WorkflowRun_Workflow] FOREIGN KEY ([WorkflowID]) REFERENCES [__mj].[Workflow] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[Workflow]'
GO
ALTER TABLE [__mj].[Workflow] ADD CONSTRAINT [FK_Workflow_WorkflowEngine] FOREIGN KEY ([WorkflowEngineID]) REFERENCES [__mj].[WorkflowEngine] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[WorkspaceItem]'
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD CONSTRAINT [FK__Workspace__Resou__73305268] FOREIGN KEY ([ResourceTypeID]) REFERENCES [__mj].[ResourceType] ([ID])
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD CONSTRAINT [FK__Workspace__WorkS__2C538F61] FOREIGN KEY ([WorkspaceID]) REFERENCES [__mj].[Workspace] ([ID])
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
	EXEC sp_addextendedproperty N'ms_description', 'The name of the model to use with API calls which might differ from the Name, if APIName is not provided, Name will be used for API calls', 'SCHEMA', N'__mj', 'TABLE', N'AIModel', 'COLUMN', N'APIName'
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
	EXEC sp_addextendedproperty N'ms_description', 'A simplified power rank of each model for a given AI Model Type. For example, if we have GPT 3, GPT 3.5, and GPT 4, we would have a PowerRank of 1 for GPT3, 2 for GPT 3.5, and 3 for GPT 4. This can be used within model families like OpenAI or across all models. For example if you had Llama 2 in the mix which is similar to GPT 3.5 it would also have a PowerRank of 2. This can be used at runtime to pick the most/least powerful or compare model relative power.', 'SCHEMA', N'__mj', 'TABLE', N'AIModel', 'COLUMN', N'PowerRank'
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
	EXEC sp_addextendedproperty N'ms_description', N'Links actions to authorizations, one or more of these must be possessed by a user in order to execute the action.', 'SCHEMA', N'__mj', 'TABLE', N'ActionAuthorization', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Organizes actions into categories, including name, description, and optional parent category for hierarchy.', 'SCHEMA', N'__mj', 'TABLE', N'ActionCategory', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Description of the action category.', 'SCHEMA', N'__mj', 'TABLE', N'ActionCategory', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'ms_description', N'Name of the action category.', 'SCHEMA', N'__mj', 'TABLE', N'ActionCategory', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'ms_description', N'Status of the action category (Pending, Active, Disabled).', 'SCHEMA', N'__mj', 'TABLE', N'ActionCategory', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'ms_description', N'Lists possible contexts for action execution with optional descriptions.', 'SCHEMA', N'__mj', 'TABLE', N'ActionContextType', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Description of the context type.', 'SCHEMA', N'__mj', 'TABLE', N'ActionContextType', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'ms_description', N'Name of the context type.', 'SCHEMA', N'__mj', 'TABLE', N'ActionContextType', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'ms_description', N'Links actions to their supported context types enabling a given action to be executable in more than one context.', 'SCHEMA', N'__mj', 'TABLE', N'ActionContext', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Status of the action context (Pending, Active, Disabled).', 'SCHEMA', N'__mj', 'TABLE', N'ActionContext', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'ms_description', N'Tracks every execution of an action, including start and end times, inputs, outputs, and result codes.', 'SCHEMA', N'__mj', 'TABLE', N'ActionExecutionLog', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Timestamp of when the action ended execution.', 'SCHEMA', N'__mj', 'TABLE', N'ActionExecutionLog', 'COLUMN', N'EndedAt'
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
	EXEC sp_addextendedproperty N'ms_description', N'Number of days to retain the log; NULL for indefinite retention.', 'SCHEMA', N'__mj', 'TABLE', N'ActionExecutionLog', 'COLUMN', N'RetentionPeriod'
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
	EXEC sp_addextendedproperty N'ms_description', N'Timestamp of when the action started execution.', 'SCHEMA', N'__mj', 'TABLE', N'ActionExecutionLog', 'COLUMN', N'StartedAt'
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
	EXEC sp_addextendedproperty N'ms_description', N'Defines filters that can be evaluated ahead of executing an action. Action Filters are usable in any code pipeline you can execute them with the same context as the action itself and use the outcome to determine if the action should execute or not.', 'SCHEMA', N'__mj', 'TABLE', N'ActionFilter', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Tracks the list of libraries that a given Action uses, including a list of classes/functions for each library.', 'SCHEMA', N'__mj', 'TABLE', N'ActionLibrary', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'List of classes and functions used by the action from the library.', 'SCHEMA', N'__mj', 'TABLE', N'ActionLibrary', 'COLUMN', N'ItemsUsed'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Tracks the input and output parameters for Actions.', 'SCHEMA', N'__mj', 'TABLE', N'ActionParam', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Tracks the basic value type of the parameter, additional information can be provided in the Description field', 'SCHEMA', N'__mj', 'TABLE', N'ActionParam', 'COLUMN', N'ValueType'
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
	EXEC sp_addextendedproperty N'ms_description', N'Defines the possible result codes for each action.', 'SCHEMA', N'__mj', 'TABLE', N'ActionResultCode', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Description of the result code.', 'SCHEMA', N'__mj', 'TABLE', N'ActionResultCode', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the result code is a success or not. It is possible an action might have more than one failure condition/result code and same for success conditions.', 'SCHEMA', N'__mj', 'TABLE', N'ActionResultCode', 'COLUMN', N'IsSuccess'
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
	EXEC sp_addextendedproperty N'ms_description', N'Stores action definitions, including prompts, generated code, user comments, and status.', 'SCHEMA', N'__mj', 'TABLE', N'Action', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Optional comments when an individual (or an AI) reviews and approves the code.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeApprovalComments'
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
	EXEC sp_addextendedproperty N'ms_description', N'An action won''t be usable until the code is approved.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeApprovalStatus'
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
	EXEC sp_addextendedproperty N'ms_description', N'When the code was approved.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeApprovedAt'
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
	EXEC sp_addextendedproperty N'ms_description', N'AI''s explanation of the code.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeComments'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, Code will never be generated by the AI system. This overrides all other settings including the ForceCodeGeneration bit', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeLocked'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, the Action will generate code for the provided UserPrompt on the next Save even if the UserPrompt hasn''t changed. This is useful to force regeneration when other candidates (such as a change in Action Inputs/Outputs) occurs or on demand by a user.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'ForceCodeGeneration'
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
	EXEC sp_addextendedproperty N'ms_description', N'Number of days to retain execution logs; NULL for indefinite.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'RetentionPeriod'
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
	EXEC sp_addextendedproperty N'ms_description', N'Status of the action (Pending, Active, Disabled).', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Generated or Custom. Generated means the UserPrompt is used to prompt an AI model to automatically create the code for the Action. Custom means that a custom class has been implemented that subclasses the BaseAction class. The custom class needs to use the @RegisterClass decorator and be included in the MJAPI (or other runtime environment) to be available for execution.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'ms_description', N'User''s comments not shared with the LLM.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'UserComments'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, the entity will be included by default for a new user when they first access the application in question', 'SCHEMA', N'__mj', 'TABLE', N'ApplicationEntity', 'COLUMN', N'DefaultForNewUser'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list.', 'SCHEMA', N'__mj', 'TABLE', N'Application', 'COLUMN', N'DefaultForNewUser'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Specify the CSS class information for the display icon for each application.', 'SCHEMA', N'__mj', 'TABLE', N'Application', 'COLUMN', N'Icon'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, Audit Log records are created whenever this authorization is invoked for a user', 'SCHEMA', N'__mj', 'TABLE', N'Authorization', 'COLUMN', N'UseAuditLog'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Base message types and their supported functionalities.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationBaseMessageType', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The maximum size in bytes for the message.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationBaseMessageType', 'COLUMN', N'MaxBytes'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if attachments are supported.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationBaseMessageType', 'COLUMN', N'SupportsAttachments'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if HTML content is supported.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationBaseMessageType', 'COLUMN', N'SupportsHtml'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if a subject line is supported.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationBaseMessageType', 'COLUMN', N'SupportsSubjectLine'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Logs of sent and received messages.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationLog', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The direction of the communication log (Sending or Receiving).', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationLog', 'COLUMN', N'Direction'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The error message if the message sending failed.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationLog', 'COLUMN', N'ErrorMessage'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The content of the logged message.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationLog', 'COLUMN', N'MessageContent'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The date and time when the message was logged.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationLog', 'COLUMN', N'MessageDate'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The status of the logged message (Pending, In-Progress, Complete, Failed).', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationLog', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Providers and their supported message types with additional attributes.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProviderMessageType', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Additional attributes specific to the provider message type.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProviderMessageType', 'COLUMN', N'AdditionalAttributes'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The status of the provider message type (Disabled or Active).', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProviderMessageType', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'All supported communication providers.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProvider', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The status of the communication provider (Disabled or Active).', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProvider', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the provider supports receiving messages.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProvider', 'COLUMN', N'SupportsReceiving'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the provider supports sending messages.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationProvider', 'COLUMN', N'SupportsSending'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Runs of bulk message sends and receives.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationRun', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The direction of the communication run (Sending or Receiving).', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationRun', 'COLUMN', N'Direction'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The error message if the communication run failed.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationRun', 'COLUMN', N'ErrorMessage'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The status of the communication run (Pending, In-Progress, Complete, Failed).', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationRun', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Value between 0 and 1 designating the computed probability of a match', 'SCHEMA', N'__mj', 'TABLE', N'DuplicateRunDetailMatch', 'COLUMN', N'MatchProbability'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Either Vector or SP', 'SCHEMA', N'__mj', 'TABLE', N'DuplicateRunDetailMatch', 'COLUMN', N'MatchSource'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If MatchStatus=''Error'' this field can be used to track the error from that phase of the process for logging/diagnostics.', 'SCHEMA', N'__mj', 'TABLE', N'DuplicateRunDetail', 'COLUMN', N'MatchErrorMessage'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If MatchStatus=Skipped, this field can be used to store the reason why the record was skipped', 'SCHEMA', N'__mj', 'TABLE', N'DuplicateRunDetail', 'COLUMN', N'SkippedReason'
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
	EXEC sp_addextendedproperty N'ms_description', N'Optional use. Maps Action Filters to specific EntityAction instances, specifying execution order and status. This allows for “pre-processing” before an Action actually is fired off, to check for various state/dirty/value conditions.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionFilter', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Order of filter execution.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionFilter', 'COLUMN', N'Sequence'
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
	EXEC sp_addextendedproperty N'ms_description', N'Status of the entity action filter (Pending, Active, Disabled).', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionFilter', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'ms_description', N'Stores the possible invocation types of an action within the context of an entity. Examples would be: Record Created/Updated/Deleted/Accessed as well as things like “View” or “List” where you could run an EntityAction against an entire set of records in a view or list – either by user click or programmatically.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionInvocationType', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Description of the invocation type.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionInvocationType', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'ms_description', N'Name of the invocation type such as Record Created/Updated/etc.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionInvocationType', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'ms_description', N'Links invocation types to entity actions – for example you might link a particular EntityAction to just “Create Record” and you might also have a second item in this table allowing the same Entity Action to be invoked from a User View or List, on demand.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionInvocation', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Status of the entity action invocation (Pending, Active, Disabled).', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionInvocation', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Stores paramater mappings to enable Entity Actions to automatically invoke Actions', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Additional comments regarding the parameter.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', 'COLUMN', N'Comments'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Value of the parameter, used only when ValueType is Static or Script. When value is Script, any valid JavaScript code can be provided. The script will have access to an object called EntityActionContext. This object will have a property called EntityObject on it that will contain the BaseEntity derived sub-class with the current data for the entity object this action is operating against. The script must provide the parameter value to the EntityActionContext.result property. This scripting capabilty is designed for very small and simple code, for anything of meaningful complexity, create a sub-class instead.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', 'COLUMN', N'Value'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the value, which can be Static, Entity Object, or Script.', 'SCHEMA', N'__mj', 'TABLE', N'EntityActionParam', 'COLUMN', N'ValueType'
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
	EXEC sp_addextendedproperty N'ms_description', N'Links entities to actions - this is the main place where you define the actions that part of, or available, for a given entity.', 'SCHEMA', N'__mj', 'TABLE', N'EntityAction', NULL, NULL
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
	EXEC sp_addextendedproperty N'ms_description', N'Status of the entity action (Pending, Active, Disabled).', 'SCHEMA', N'__mj', 'TABLE', N'EntityAction', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Mapping between entity fields and communication base message types with priority', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationField', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the field in the entity that maps to the communication base message type', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationField', 'COLUMN', N'FieldName'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Priority of the field for the communication base message type', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationField', 'COLUMN', N'Priority'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Mapping between entities and communication base message types', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationMessageType', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates whether the message type is active', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationMessageType', 'COLUMN', N'IsActive'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Value between 0 and 1 that determines what is considered an absolute matching record. Value must be >= PotentialMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.', 'SCHEMA', N'__mj', 'TABLE', N'EntityDocument', 'COLUMN', N'AbsoluteMatchThreshold'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Value between 0 and 1 that determines what is considered a potential matching record. Value must be <= AbsoluteMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.', 'SCHEMA', N'__mj', 'TABLE', N'EntityDocument', 'COLUMN', N'PotentialMatchThreshold'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Does the column allow null or not (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'AllowsNull'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, this field will be considered updateable by the API and object model. For this field to have effect, the column type must be updateable (e.g. not part of the primary key and not auto-increment)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'AllowUpdateAPI'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, and if AllowUpdateAPI=1, the field can be edited within a view when the view is in edit mode.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'AllowUpdateInView'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If this field automatically increments within the table, this field is set to 1 (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'AutoIncrement'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Used for generating custom tabs in the generated forms, only utilized if GeneratedFormSection=Category', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Category'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The type of code associated with this field. Only used when the ExtendedType field is set to "Code"', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'CodeType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Determines the default width for this field when included in a view', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'DefaultColumnWidth'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, this field will be included by default in any new view created by a user.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'DefaultInView'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If a default value is defined for the field it is stored here (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'DefaultValue'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Descriptive text explaining the purpose of the field', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'A user friendly alternative to the field name', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'DisplayName'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, used for "Soft Keys" to link records to different entity/record combinations on a per-record basis (for example the FileEntityRecordLink table has an EntityID/RecordID field pair. For that entity, the RecordID specifies "EntityID" for this field. This information allows MJ to detect soft keys/links for dependency detection, merging and for preventing orphaned soft-linked records during delete operations.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'EntityIDFieldName'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Defines extended behaviors for a field such as for Email, Web URLs, Code, etc.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'ExtendedType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, CodeGen will automatically generate a Full Text Catalog/Index in the database and include this field in the search index.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'FullTextSearchEnabled'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When set to Top, the field will be placed in a "top area" on the top of a generated form and visible regardless of which tab is displayed. When set to "category" Options: Top, Category, Details', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'GeneratedFormSection'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, this field will be included in the generated form by CodeGen. If set to 0, this field will be excluded from the generated form. For custom forms, this field has no effect as the layout is controlled independently.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IncludeInGeneratedForm'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, this column will be included in user search queries for both traditional and full text search', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IncludeInUserSearchAPI'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, the "Name" field of the Related Entity will be included in this entity as a virtual field', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IncludeRelatedEntityNameFieldInBaseView'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 1, this column will be used as the "Name" field for the entity and will be used to display the name of the record in various places in the UI.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IsNameField'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the field is part of the primary key for the entity (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IsPrimaryKey'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the field must have unique values within the entity.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IsUnique'
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
	EXEC sp_addextendedproperty N'MS_Description', N'NULL', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'IsVirtual'
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
	EXEC sp_addextendedproperty N'MS_Description', N'SQL data length (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Length'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the field within the database table', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'MS_Description', N'SQL precision (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Precision'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Controls the generated form in the MJ Explorer UI - defaults to a search box, other option is a drop down. Possible values are Search and Dropdown', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'RelatedEntityDisplayType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the field in the Related Entity that this field links to (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'RelatedEntityFieldName'
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
	EXEC sp_addextendedproperty N'MS_Description', N'SQL scale (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Scale'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Display order of the field within the entity', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Sequence'
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
	EXEC sp_addextendedproperty N'MS_Description', N'SQL Data type (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'MS_Description', N'NULL', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'UserSearchParamFormatAPI'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Possible Values of None, List, ListOrUserEntry - the last option meaning that the list of possible values are options, but a user can enter anything else desired too.', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'ValueListType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'NULL', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'ViewCellTemplate'
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
	EXEC sp_addextendedproperty N'MS_Description', N'This table stores a list of components that are available for displaying relationships in the MJ Explorer UI', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationshipDisplayComponent', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The type of relationship the component displays. Valid values are "One to Many", "Many to Many", or "Both".', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationshipDisplayComponent', 'COLUMN', N'RelationshipType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If DisplayComponentID is specified, this field can optionally be used to track component-specific and relationship-specific configuration details that will be used by CodeGen to provide to the display component selected.', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayComponentConfiguration'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If specified, the icon ', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayIcon'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When Related Entity Icon - uses the icon from the related entity, if one exists. When Custom, uses the value in the DisplayIcon field in this record, and when None, no icon is displayed', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayIconType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When unchecked the relationship will NOT be displayed on the generated form', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayInForm'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, when specified this value overrides the related entity name for the label on the tab', 'SCHEMA', N'__mj', 'TABLE', N'EntityRelationship', 'COLUMN', N'DisplayName'
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
	EXEC sp_addextendedproperty N'MS_Description', N'This field must be turned on in order to enable merging of records for the entity. For AllowRecordMerge to be turned on, AllowDeleteAPI must be set to 1, and DeleteType must be set to Soft', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'AllowRecordMerge'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, the deleted spDelete will pre-process deletion to related entities that have 1:M cardinality with this entity. This does not have effect if spDeleteGenerated = 0', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'CascadeDeletes'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Hard deletes physically remove rows from the underlying BaseTable. Soft deletes do not remove rows but instead mark the row as deleted by using the special field __mj_DeletedAt which will automatically be added to the entity''s basetable by the CodeGen tool.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'DeleteType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, specify an icon (CSS Class) for each entity for display in the UI', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'Icon'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Used to specify a field within the entity that in turn contains the field name that will be used for record-level communication preferences. For example in a hypothetical entity called Contacts, say there is a field called PreferredComm and that field had possible values of Email1, SMS, and Phone, and those value in turn corresponded to field names in the entity. Each record in the Contacts entity could have a specific preference for which field would be used for communication. The MJ Communication Framework will use this information when available, as a priority ahead of the data in the Entity Communication Fields entity which is entity-level and not record-level.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'PreferredCommunicationField'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When another entity links to this entity with a foreign key, this is the default component type that will be used in the UI. CodeGen will populate the RelatedEntityDisplayType column in the Entity Fields entity with whatever is provided here whenever a new foreign key is detected by CodeGen. The selection can be overridden on a per-foreign-key basis in each row of the Entity Fields entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'RelationshipDefaultDisplayType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When specified, this stored procedure is used to find matching records in this particular entity. The convention is to pass in the primary key(s) columns for the given entity to the procedure and the return will be zero to many rows where there is a column for each primary key field(s) and a ProbabilityScore (numeric(1,12)) column that has a 0 to 1 value of the probability of a match.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'spMatch'
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
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table. In addition, when turned on CodeGen will ensure that your table has two fields: __mj_CreatedAt and __mj_UpdatedAt which are special fields used in conjunction with the RecordChange table to track changes to rows in your entity.', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'TrackRecordChanges'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Table to store navigation items for MemberJunction Explorer', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Administrator comments, not shown to the end user in MJ Explorer app', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'Comments'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Description of the navigation item, shown to the user on hover or in larger displays', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, CSS class for an icon to be displayed with the navigation item', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'IconCSSClass'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Unique identifier for each navigation item', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'ID'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates if the navigation item is active; allows turning off items in the UI without deleting them from the metadata', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'IsActive'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Unique name of the navigation item displayed to the user', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The route for the navigation item relative to the app main URL, using Angular syntax like "entity/:entityName"', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'Route'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Sequence number for the navigation item, must be unique and greater than 0', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'Sequence'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Controls if the navigation item is shown on the Home screen for MJ Explorer', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'ShowInHomeScreen'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Controls if the item is shown in the left navigation drawer in the MJ Explorer app or not.', 'SCHEMA', N'__mj', 'TABLE', N'ExplorerNavigationItem', 'COLUMN', N'ShowInNavigationDrawer'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The URL Format for the given integration including the ability to include markup with fields from the integration', 'SCHEMA', N'__mj', 'TABLE', N'IntegrationURLFormat', 'COLUMN', N'URLFormat'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Table to store individual library items', 'SCHEMA', N'__mj', 'TABLE', N'LibraryItem', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the library item for example Class, Interface, etc.', 'SCHEMA', N'__mj', 'TABLE', N'LibraryItem', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Stores information about the available libraries, including a list of classes/functions, type definitions, and sample code. You can add additional custom libraries here to make them avaialable to code generation features within the system.', 'SCHEMA', N'__mj', 'TABLE', N'Library', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Examples of code use of the classes and/or functions from within the library', 'SCHEMA', N'__mj', 'TABLE', N'Library', 'COLUMN', N'SampleCode'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Status of the library, only libraries marked as Active will be available for use by generated code. If a library was once active but no longer is, existing code that used the library will not be affected.', 'SCHEMA', N'__mj', 'TABLE', N'Library', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Code showing the types and functions defined in the library to be used for reference by humans and AI', 'SCHEMA', N'__mj', 'TABLE', N'Library', 'COLUMN', N'TypeDefinitions'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Higher numbers indicate more execution overhead/time required. Useful for planning which queries to use in various scenarios.', 'SCHEMA', N'__mj', 'TABLE', N'Query', 'COLUMN', N'ExecutionCostRank'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Value indicating the quality of the query, higher values mean a better quality', 'SCHEMA', N'__mj', 'TABLE', N'Query', 'COLUMN', N'QualityRank'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Table to store individual recommendation items that are the right side of the recommendation which we track in the DestinationEntityID/DestinationEntityRecordID', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationItem', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The record ID of the destination entity', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationItem', 'COLUMN', N'DestinationEntityRecordID'
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
	EXEC sp_addextendedproperty N'MS_Description', N'A value between 0 and 1 indicating the probability of the match, higher numbers indicating a more certain match/recommendation.', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationItem', 'COLUMN', N'MatchProbability'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Recommendation providers details', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationProvider', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Recommendation runs log each time a provider is requested to provide recommendations', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationRun', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The end date of the recommendation run', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationRun', 'COLUMN', N'EndDate'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The start date of the recommendation run', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationRun', 'COLUMN', N'StartDate'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The status of the recommendation run', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationRun', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Recommendation headers that store the left side of the recommendation which we track in the SourceEntityID/SourceEntityRecordID', 'SCHEMA', N'__mj', 'TABLE', N'Recommendation', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'The record ID of the source entity', 'SCHEMA', N'__mj', 'TABLE', N'Recommendation', 'COLUMN', N'SourceEntityRecordID'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Table to track the runs of replaying external record changes', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Timestamp when the replay run ended', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', 'COLUMN', N'EndedAt'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Timestamp when the replay run started', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', 'COLUMN', N'StartedAt'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Status of the replay run (Pending, In Progress, Complete, Error)', 'SCHEMA', N'__mj', 'TABLE', N'RecordChangeReplayRun', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The date/time that the change occured.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ChangedAt'
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
	EXEC sp_addextendedproperty N'MS_Description', N'A generated, human-readable description of what was changed.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ChangesDescription'
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
	EXEC sp_addextendedproperty N'MS_Description', N'JSON structure that describes what was changed in a structured format.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ChangesJSON'
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
	EXEC sp_addextendedproperty N'MS_Description', N'A complete snapshot of the record AFTER the change was applied in a JSON format that can be parsed.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'FullRecordJSON'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Internal or External', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'Source'
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
	EXEC sp_addextendedproperty N'MS_Description', N'For internal record changes generated within MJ, the status is immediately Complete. For external changes that are detected, the workflow starts off as Pending, then In Progress and finally either Complete or Error', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Create, Update, or Delete', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Track scheduled actions and their details', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Cron expression defining the schedule, automatically maintained by the system unless Type is Custom, in which case the user directly sets this', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'CronExpression'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Day of the month for the scheduled action', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'DayOfMonth'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Day of the week for the scheduled action', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'DayOfWeek'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Interval in days for the scheduled action', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'IntervalDays'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Month for the scheduled action', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'Month'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Status of the scheduled action (Pending, Active, Disabled, Expired)', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'Status'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Timezone for the scheduled action, if not specified defaults to UTC/Z', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'Timezone'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the scheduled action (Daily, Weekly, Monthly, Yearly, Custom)', 'SCHEMA', N'__mj', 'TABLE', N'ScheduledAction', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Template categories for organizing templates', 'SCHEMA', N'__mj', 'TABLE', N'TemplateCategory', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Description of the template category', 'SCHEMA', N'__mj', 'TABLE', N'TemplateCategory', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the template category', 'SCHEMA', N'__mj', 'TABLE', N'TemplateCategory', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Template content types for categorizing content within templates', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContentType', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Refers to the primary language or codetype of the templates of this type, HTML, JSON, JavaScript, etc', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContentType', 'COLUMN', N'CodeType'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Description of the template content type', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContentType', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the template content type', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContentType', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Template content for different versions of a template for purposes like HTML/Text/etc', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContent', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Indicates whether the content is active or not. Use this to disable a particular Template Content item without having to remove it', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContent', 'COLUMN', N'IsActive'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Priority of the content version, higher priority versions will be used ahead of lower priority versions for a given Type', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContent', 'COLUMN', N'Priority'
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
	EXEC sp_addextendedproperty N'MS_Description', N'The actual text content for the template', 'SCHEMA', N'__mj', 'TABLE', N'TemplateContent', 'COLUMN', N'TemplateText'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Parameters allowed for use inside the template', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Default value of the parameter', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'DefaultValue'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Description of the parameter', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Only used when Type = Entity, used to specify an optional filter to reduce the set of rows that are returned for each of the templates being rendered.', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'ExtraFilter'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If the LinkedParameterName is specified, this is an optional setting to specify the field within the LinkedParameter that will be used for filtering. This is only needed if there is more than one foreign key relationship between the Entity parameter and the Linked parameter, or if there is no defined foreign key in the database between the two entities.', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'LinkedParameterField'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Only used when Type=Entity, this is used to link an Entity parameter with another parameter so that the rows in the Entity parameter can be filtered automatically based on the FKEY relationship between the Record and this Entity parameter. For example, if the Entity-based parameter is for an entity like Activities and there is another parameter of type Record for an entity like Contacts, in that situation the Activities Parameter would point to the Contacts parameter as the LinkedParameterName because we would filter down the Activities in each template render to only those linked to the Contact.', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'LinkedParameterName'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the parameter', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Record ID, used only when Type is Record and a specific hardcoded record ID is desired, this is an uncommon use case, helpful for pulling in static types and metadata in some cases.', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'RecordID'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the parameter - Record is an individual record within the entity specified by EntityID. Entity means an entire Entity or an entity filtered by the LinkedParameterName/Field attributes and/or ExtraFilter. Object is any valid JSON object. Array and Scalar have their common meanings.', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'Type'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Templates are used for dynamic expansion of a static template with data from a given context. Templates can be used to create documents, messages and anything else that requires dynamic document creation merging together static text, data and lightweight logic', 'SCHEMA', N'__mj', 'TABLE', N'Template', NULL, NULL
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, if provided, this template will not be available for use until the specified date. Requires IsActive to be set to 1', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'ActiveAt'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Description of the template', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'Description'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, if provided, this template will not be available for use after the specified date. If IsActive=0, this has no effect.', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'DisabledAt'
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
	EXEC sp_addextendedproperty N'MS_Description', N'If set to 0, the template will be disabled regardless of the values in ActiveAt/DisabledAt. ', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'IsActive'
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
	EXEC sp_addextendedproperty N'MS_Description', N'Name of the template', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'Name'
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
	EXEC sp_addextendedproperty N'MS_Description', N'This prompt will be used by the AI to generate template content as requested by the user.', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'UserPrompt'
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
PRINT N'Altering permissions on  [__mj].[GetProgrammaticName]'
GO
GRANT EXECUTE ON  [__mj].[GetProgrammaticName] TO [public]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateAIAction] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateAIModelAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateAIModelAction] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateAIModelType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateAIModelType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateAIModelType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateAIModel]'
GO
GRANT EXECUTE ON  [__mj].[spCreateAIModel] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateAIModel] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionAuthorization]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionAuthorization] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionAuthorization] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionContextType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionContextType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionContextType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionContext]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionContext] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionContext] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionExecutionLog]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionExecutionLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionExecutionLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionFilter]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionFilter] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionFilter] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionLibrary]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionLibrary] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionLibrary] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateActionResultCode]'
GO
GRANT EXECUTE ON  [__mj].[spCreateActionResultCode] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateActionResultCode] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateApplicationSetting]'
GO
GRANT EXECUTE ON  [__mj].[spCreateApplicationSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateApplicationSetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateCommunicationBaseMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationBaseMessageType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationBaseMessageType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateCommunicationLog]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateCommunicationProviderMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationProviderMessageType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationProviderMessageType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateCommunicationProvider]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationProvider] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationProvider] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateCommunicationRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationRun] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateDuplicateRunDetailMatch]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDuplicateRunDetailMatch] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateDuplicateRunDetail]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDuplicateRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateDuplicateRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateDuplicateRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateDuplicateRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateDuplicateRun] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAIAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAIAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityActionFilter]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionFilter] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionFilter] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityActionInvocationType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionInvocationType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionInvocationType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityActionInvocation]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionInvocation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionInvocation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityBehaviorType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehaviorType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehaviorType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityBehavior]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehavior] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehavior] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityCommunicationField]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityCommunicationField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityCommunicationField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityCommunicationMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityCommunicationMessageType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityCommunicationMessageType] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityDocumentSetting]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentSetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityRelationshipDisplayComponent]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRelationshipDisplayComponent] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityRelationshipDisplayComponent] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateEntitySetting]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntitySetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntitySetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateExplorerNavigationItem]'
GO
GRANT EXECUTE ON  [__mj].[spCreateExplorerNavigationItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateExplorerNavigationItem] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateLibraryItem]'
GO
GRANT EXECUTE ON  [__mj].[spCreateLibraryItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateLibraryItem] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateLibrary]'
GO
GRANT EXECUTE ON  [__mj].[spCreateLibrary] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateLibrary] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateListCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateListCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateListCategory] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateRecommendationItem]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendationItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendationItem] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecommendationProvider]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendationProvider] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendationProvider] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecommendationRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendationRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendationRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecommendation]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecommendation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateRecordChangeReplayRun]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChangeReplayRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChangeReplayRun] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateRecordChange_Internal]'
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange_Internal] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange_Internal] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spCreateRecordChange_Internal] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[spCreateScheduledActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spCreateScheduledActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateScheduledActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateScheduledAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateScheduledAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateScheduledAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateTemplateCategory]'
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateTemplateContentType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateContentType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateContentType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateTemplateContent]'
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateContent] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateContent] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateTemplateParam]'
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplateParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateTemplate]'
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplate] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateTemplate] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateUserApplication]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserApplication] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateflyway_schema_history]'
GO
GRANT EXECUTE ON  [__mj].[spCreateflyway_schema_history] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateflyway_schema_history] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteAIAction] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteAIModelAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteAIModelAction] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteAIModelType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteAIModelType] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteAIModel]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteAIModel] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionAuthorization]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionAuthorization] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionCategory]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionContextType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionContextType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionContext]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionContext] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionExecutionLog]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionExecutionLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionFilter]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionFilter] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionLibrary]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionLibrary] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteActionResultCode]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteActionResultCode] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteApplicationSetting]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteApplicationSetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteCommunicationProviderMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteCommunicationProviderMessageType] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteConversationDetail]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteConversationDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteConversationDetail] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteConversationDetail] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[spDeleteDataContextItem]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteDataContextItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteDataContextItem] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteDataContextItem] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteDataContext]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteDataContext] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteDataContext] TO [cdp_Integration]
GO
GRANT EXECUTE ON  [__mj].[spDeleteDataContext] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[spDeleteEntityAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityAIAction] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityActionFilter]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityActionFilter] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityActionInvocationType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityActionInvocationType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityActionInvocation]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityActionInvocation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityBehaviorType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityBehaviorType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityBehavior]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityBehavior] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteExplorerNavigationItem]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteExplorerNavigationItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spDeleteExplorerNavigationItem] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteScheduledActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteScheduledActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteScheduledAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteScheduledAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteflyway_schema_history]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteflyway_schema_history] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateActionAuthorization]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionAuthorization] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionAuthorization] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionContextType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionContextType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionContextType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionContext]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionContext] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionContext] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionExecutionLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionExecutionLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionExecutionLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionFilter]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionFilter] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionFilter] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionLibrary]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionLibrary] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionLibrary] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateActionResultCode]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionResultCode] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateActionResultCode] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateApplicationSetting]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplicationSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplicationSetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateAuditLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAuditLog] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCommunicationBaseMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationBaseMessageType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationBaseMessageType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCommunicationLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationLog] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationLog] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCommunicationProviderMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationProviderMessageType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationProviderMessageType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCommunicationProvider]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationProvider] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationProvider] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateCommunicationRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationRun] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateDuplicateRunDetailMatch]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDuplicateRunDetailMatch] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateDuplicateRunDetail]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDuplicateRunDetail] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDuplicateRunDetail] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateDuplicateRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateDuplicateRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateDuplicateRun] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateEntityActionFilter]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionFilter] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionFilter] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityActionInvocationType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionInvocationType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionInvocationType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityActionInvocation]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionInvocation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionInvocation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityAction] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityBehaviorType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehaviorType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehaviorType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityBehavior]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehavior] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehavior] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityCommunicationField]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityCommunicationField] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityCommunicationField] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityCommunicationMessageType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityCommunicationMessageType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityCommunicationMessageType] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateEntityDocumentSetting]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentSetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateEntityRelationshipDisplayComponent]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRelationshipDisplayComponent] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityRelationshipDisplayComponent] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateEntitySetting]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntitySetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntitySetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateExplorerNavigationItem]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateExplorerNavigationItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateExplorerNavigationItem] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateLibraryItem]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateLibraryItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateLibraryItem] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateLibrary]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateLibrary] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateLibrary] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateListCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateListCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateListCategory] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateRecommendationItem]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendationItem] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendationItem] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecommendationProvider]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendationProvider] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendationProvider] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecommendationRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendationRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendationRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecommendation]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendation] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecommendation] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecordChangeReplayRun]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordChangeReplayRun] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordChangeReplayRun] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateRecordChange]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateRecordChange] TO [cdp_Developer]
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
PRINT N'Altering permissions on  [__mj].[spUpdateScheduledActionParam]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateScheduledActionParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateScheduledActionParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateScheduledAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateScheduledAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateScheduledAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateTemplateCategory]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateCategory] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateCategory] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateTemplateContentType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateContentType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateContentType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateTemplateContent]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateContent] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateContent] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateTemplateParam]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateParam] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplateParam] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateTemplate]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplate] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateTemplate] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateflyway_schema_history]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateflyway_schema_history] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateflyway_schema_history] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[vwActionAuthorizations]'
GO
GRANT SELECT ON  [__mj].[vwActionAuthorizations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionAuthorizations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionAuthorizations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionCategories]'
GO
GRANT SELECT ON  [__mj].[vwActionCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionContextTypes]'
GO
GRANT SELECT ON  [__mj].[vwActionContextTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionContextTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionContextTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionContexts]'
GO
GRANT SELECT ON  [__mj].[vwActionContexts] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionContexts] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionContexts] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionExecutionLogs]'
GO
GRANT SELECT ON  [__mj].[vwActionExecutionLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionExecutionLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionExecutionLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionFilters]'
GO
GRANT SELECT ON  [__mj].[vwActionFilters] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionFilters] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionFilters] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionLibraries]'
GO
GRANT SELECT ON  [__mj].[vwActionLibraries] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionLibraries] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionLibraries] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionParams]'
GO
GRANT SELECT ON  [__mj].[vwActionParams] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionParams] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionParams] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActionResultCodes]'
GO
GRANT SELECT ON  [__mj].[vwActionResultCodes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActionResultCodes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActionResultCodes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwActions]'
GO
GRANT SELECT ON  [__mj].[vwActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwActions] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwApplicationSettings]'
GO
GRANT SELECT ON  [__mj].[vwApplicationSettings] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwApplicationSettings] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwApplicationSettings] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwCommunicationBaseMessageTypes]'
GO
GRANT SELECT ON  [__mj].[vwCommunicationBaseMessageTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCommunicationBaseMessageTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCommunicationBaseMessageTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCommunicationLogs]'
GO
GRANT SELECT ON  [__mj].[vwCommunicationLogs] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCommunicationLogs] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCommunicationLogs] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCommunicationProviderMessageTypes]'
GO
GRANT SELECT ON  [__mj].[vwCommunicationProviderMessageTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCommunicationProviderMessageTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCommunicationProviderMessageTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCommunicationProviders]'
GO
GRANT SELECT ON  [__mj].[vwCommunicationProviders] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCommunicationProviders] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCommunicationProviders] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwCommunicationRuns]'
GO
GRANT SELECT ON  [__mj].[vwCommunicationRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCommunicationRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCommunicationRuns] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwDuplicateRunDetailMatches]'
GO
GRANT SELECT ON  [__mj].[vwDuplicateRunDetailMatches] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDuplicateRunDetailMatches] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDuplicateRunDetailMatches] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDuplicateRunDetails]'
GO
GRANT SELECT ON  [__mj].[vwDuplicateRunDetails] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDuplicateRunDetails] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDuplicateRunDetails] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwDuplicateRuns]'
GO
GRANT SELECT ON  [__mj].[vwDuplicateRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwDuplicateRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwDuplicateRuns] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwEntitiesWithExternalChangeTracking]'
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithExternalChangeTracking] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithExternalChangeTracking] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithExternalChangeTracking] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntitiesWithMissingBaseTables]'
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithMissingBaseTables] TO [cdp_Developer]
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
PRINT N'Altering permissions on  [__mj].[vwEntityActionFilters]'
GO
GRANT SELECT ON  [__mj].[vwEntityActionFilters] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityActionFilters] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityActionFilters] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityActionInvocationTypes]'
GO
GRANT SELECT ON  [__mj].[vwEntityActionInvocationTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityActionInvocationTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityActionInvocationTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityActionInvocations]'
GO
GRANT SELECT ON  [__mj].[vwEntityActionInvocations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityActionInvocations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityActionInvocations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityActionParams]'
GO
GRANT SELECT ON  [__mj].[vwEntityActionParams] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityActionParams] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityActionParams] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityActions]'
GO
GRANT SELECT ON  [__mj].[vwEntityActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityActions] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityCommunicationFields]'
GO
GRANT SELECT ON  [__mj].[vwEntityCommunicationFields] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityCommunicationFields] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityCommunicationFields] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityCommunicationMessageTypes]'
GO
GRANT SELECT ON  [__mj].[vwEntityCommunicationMessageTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityCommunicationMessageTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityCommunicationMessageTypes] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwEntityDocumentSettings]'
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentSettings] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentSettings] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityDocumentSettings] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwEntityRelationshipDisplayComponents]'
GO
GRANT SELECT ON  [__mj].[vwEntityRelationshipDisplayComponents] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityRelationshipDisplayComponents] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityRelationshipDisplayComponents] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwEntitySettings]'
GO
GRANT SELECT ON  [__mj].[vwEntitySettings] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntitySettings] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntitySettings] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwExplorerNavigationItems]'
GO
GRANT SELECT ON  [__mj].[vwExplorerNavigationItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwExplorerNavigationItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwExplorerNavigationItems] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwLibraries]'
GO
GRANT SELECT ON  [__mj].[vwLibraries] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwLibraries] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwLibraries] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwLibraryItems]'
GO
GRANT SELECT ON  [__mj].[vwLibraryItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwLibraryItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwLibraryItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwListCategories]'
GO
GRANT SELECT ON  [__mj].[vwListCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwListCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwListCategories] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwRecommendationItems]'
GO
GRANT SELECT ON  [__mj].[vwRecommendationItems] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecommendationItems] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecommendationItems] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecommendationProviders]'
GO
GRANT SELECT ON  [__mj].[vwRecommendationProviders] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecommendationProviders] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecommendationProviders] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecommendationRuns]'
GO
GRANT SELECT ON  [__mj].[vwRecommendationRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecommendationRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecommendationRuns] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecommendations]'
GO
GRANT SELECT ON  [__mj].[vwRecommendations] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecommendations] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecommendations] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwRecordChangeReplayRuns]'
GO
GRANT SELECT ON  [__mj].[vwRecordChangeReplayRuns] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwRecordChangeReplayRuns] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwRecordChangeReplayRuns] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwScheduledActionParams]'
GO
GRANT SELECT ON  [__mj].[vwScheduledActionParams] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwScheduledActionParams] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwScheduledActionParams] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwScheduledActions]'
GO
GRANT SELECT ON  [__mj].[vwScheduledActions] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwScheduledActions] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwScheduledActions] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwTemplateCategories]'
GO
GRANT SELECT ON  [__mj].[vwTemplateCategories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwTemplateCategories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwTemplateCategories] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwTemplateContentTypes]'
GO
GRANT SELECT ON  [__mj].[vwTemplateContentTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwTemplateContentTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwTemplateContentTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwTemplateContents]'
GO
GRANT SELECT ON  [__mj].[vwTemplateContents] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwTemplateContents] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwTemplateContents] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwTemplateParams]'
GO
GRANT SELECT ON  [__mj].[vwTemplateParams] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwTemplateParams] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwTemplateParams] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwTemplates]'
GO
GRANT SELECT ON  [__mj].[vwTemplates] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwTemplates] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwTemplates] TO [cdp_UI]
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
PRINT N'Altering permissions on  [__mj].[vwflyway_schema_histories]'
GO
GRANT SELECT ON  [__mj].[vwflyway_schema_histories] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwflyway_schema_histories] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwflyway_schema_histories] TO [cdp_UI]
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