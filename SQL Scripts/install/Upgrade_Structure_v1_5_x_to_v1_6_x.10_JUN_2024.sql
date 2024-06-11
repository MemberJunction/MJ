/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.5.x
   TO:   1.6.x
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
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping foreign keys from [__mj].[CommunicationTemplate]'
GO
ALTER TABLE [__mj].[CommunicationTemplate] DROP CONSTRAINT [FK__Communica__Paren__78FB3EC5]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationTemplate]'
GO
ALTER TABLE [__mj].[CommunicationTemplate] DROP CONSTRAINT [PK__Communic__3214EC27A0F9E4AD]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationTemplate]'
GO
ALTER TABLE [__mj].[CommunicationTemplate] DROP CONSTRAINT [DF__Communica__Creat__7712F653]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[CommunicationTemplate]'
GO
ALTER TABLE [__mj].[CommunicationTemplate] DROP CONSTRAINT [DF__Communica__Updat__78071A8C]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping [__mj].[spUpdateCommunicationTemplate]'
GO
DROP PROCEDURE [__mj].[spUpdateCommunicationTemplate]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping [__mj].[spCreateCommunicationTemplate]'
GO
DROP PROCEDURE [__mj].[spCreateCommunicationTemplate]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping [__mj].[vwCommunicationTemplates]'
GO
DROP VIEW [__mj].[vwCommunicationTemplates]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping [__mj].[CommunicationTemplate]'
GO
DROP TABLE [__mj].[CommunicationTemplate]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[CommunicationRun]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[CommunicationRun] ADD
[StartedAt] [datetime] NULL,
[EndedAt] [datetime] NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Entity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD
[PreferredCommunicationField] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityCommunicationMessageType]'
GO
CREATE TABLE [__mj].[EntityCommunicationMessageType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[BaseMessageTypeID] [int] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__EntityCom__IsAct__36A5CD88] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityCom__Creat__3799F1C1] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityCom__Updat__388E15FA] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityCo__3214EC275B1A9FD7] on [__mj].[EntityCommunicationMessageType]'
GO
ALTER TABLE [__mj].[EntityCommunicationMessageType] ADD CONSTRAINT [PK__EntityCo__3214EC275B1A9FD7] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityCommunicationField]'
GO
CREATE TABLE [__mj].[EntityCommunicationField]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityCommunicationMessageTypeID] [int] NOT NULL,
[FieldName] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Priority] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityCom__Creat__57F1B2BA] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityCom__Updat__58E5D6F3] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityCo__3214EC276AF51691] on [__mj].[EntityCommunicationField]'
GO
ALTER TABLE [__mj].[EntityCommunicationField] ADD CONSTRAINT [PK__EntityCo__3214EC276AF51691] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateCategory]'
GO
CREATE TABLE [__mj].[TemplateCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[UserID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateC__Creat__64A00BB4] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateC__Updat__65942FED] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Template__3214EC27597F34A3] on [__mj].[TemplateCategory]'
GO
ALTER TABLE [__mj].[TemplateCategory] ADD CONSTRAINT [PK__Template__3214EC27597F34A3] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Template]'
GO
CREATE TABLE [__mj].[Template]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CategoryID] [int] NULL,
[UserID] [int] NOT NULL,
[ActiveAt] [datetime] NULL,
[DisabledAt] [datetime] NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF_Template_IsActive] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Template__Create__6A58E50A] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Template__Update__6B4D0943] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Template__3214EC27E0A035C7] on [__mj].[Template]'
GO
ALTER TABLE [__mj].[Template] ADD CONSTRAINT [PK__Template__3214EC27E0A035C7] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateContent]'
GO
CREATE TABLE [__mj].[TemplateContent]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[TemplateID] [int] NOT NULL,
[TypeID] [int] NOT NULL,
[TemplateText] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Priority] [int] NOT NULL,
[IsActive] [bit] NOT NULL CONSTRAINT [DF__TemplateC__IsAct__347CC29D] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateC__Creat__3570E6D6] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateC__Updat__36650B0F] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Template__3214EC2742AC2B10] on [__mj].[TemplateContent]'
GO
ALTER TABLE [__mj].[TemplateContent] ADD CONSTRAINT [PK__Template__3214EC2742AC2B10] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateContentType]'
GO
CREATE TABLE [__mj].[TemplateContentType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateC__Creat__30AC31B9] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateC__Updat__31A055F2] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Template__3214EC27B09A6870] on [__mj].[TemplateContentType]'
GO
ALTER TABLE [__mj].[TemplateContentType] ADD CONSTRAINT [PK__Template__3214EC27B09A6870] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[TemplateParam]'
GO
CREATE TABLE [__mj].[TemplateParam]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[TemplateID] [int] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__TemplatePa__Type__4A6C03BC] DEFAULT ('Scalar'),
[DefaultValue] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsRequired] [bit] NOT NULL CONSTRAINT [DF_TemplateParam_IsRequired] DEFAULT ((0)),
[EntityID] [int] NULL,
[RecordID] [nvarchar] (2000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateP__Creat__4C544C2E] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__TemplateP__Updat__4D487067] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Template__3214EC2750C878DD] on [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] ADD CONSTRAINT [PK__Template__3214EC2750C878DD] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecommendationRun]'
GO
CREATE TABLE [__mj].[RecommendationRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[RecommendationProviderID] [int] NOT NULL,
[StartDate] [datetime] NOT NULL,
[EndDate] [datetime] NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[RunByUserID] [int] NOT NULL,
[CreatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Creat__703D7240] DEFAULT (getdate()),
[UpdatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Updat__71319679] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Recommen__3214EC271CAF4E7F] on [__mj].[RecommendationRun]'
GO
ALTER TABLE [__mj].[RecommendationRun] ADD CONSTRAINT [PK__Recommen__3214EC271CAF4E7F] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Recommendation]'
GO
CREATE TABLE [__mj].[Recommendation]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[RecommendationRunID] [int] NOT NULL,
[SourceEntityID] [int] NOT NULL,
[SourceEntityRecordID] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CreatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Creat__76EA6FCF] DEFAULT (getdate()),
[UpdatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Updat__77DE9408] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Recommen__3214EC279981E81A] on [__mj].[Recommendation]'
GO
ALTER TABLE [__mj].[Recommendation] ADD CONSTRAINT [PK__Recommen__3214EC279981E81A] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecommendationItem]'
GO
CREATE TABLE [__mj].[RecommendationItem]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[RecommendationID] [int] NOT NULL,
[DestinationEntityID] [int] NOT NULL,
[DestinationEntityRecordID] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MatchProbability] [decimal] (18, 15) NULL,
[CreatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Creat__7D976D5E] DEFAULT (getdate()),
[UpdatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Updat__7E8B9197] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Recommen__3214EC2780210AF1] on [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] ADD CONSTRAINT [PK__Recommen__3214EC2780210AF1] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[RecommendationProvider]'
GO
CREATE TABLE [__mj].[RecommendationProvider]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Creat__6C6CE15C] DEFAULT (getdate()),
[UpdatedAt] [datetime] NULL CONSTRAINT [DF__Recommend__Updat__6D610595] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Recommen__3214EC27C7FBE873] on [__mj].[RecommendationProvider]'
GO
ALTER TABLE [__mj].[RecommendationProvider] ADD CONSTRAINT [PK__Recommen__3214EC27C7FBE873] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteAIModel]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIModel]
    @ID int
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
PRINT N'Creating [__mj].[spUpdateRecommendationRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendationRun]
    @ID int,
    @RecommendationProviderID int,
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID int
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
        [RunByUserID] = @RunByUserID,
        [UpdatedAt] = GETDATE()
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
PRINT N'Altering [__mj].[spUpdateCommunicationRun]'
GO


ALTER PROCEDURE [__mj].[spUpdateCommunicationRun]
    @ID int,
    @UserID int,
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
        [ErrorMessage] = @ErrorMessage,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateRecommendationItem]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendationItem]
    @ID int,
    @RecommendationID int,
    @DestinationEntityID int,
    @DestinationEntityRecordID nvarchar(MAX),
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
        [MatchProbability] = @MatchProbability,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateEntityCommunicationField]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityCommunicationField]
    @ID int,
    @EntityCommunicationMessageTypeID int,
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
        [Priority] = @Priority,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateAIModelType]'
GO


CREATE PROCEDURE [__mj].[spCreateAIModelType]
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[AIModelType]
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
    SELECT * FROM [__mj].[vwAIModelTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntity]'
GO


ALTER PROCEDURE [__mj].[spCreateEntity]
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
    @spMatch nvarchar(255),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255)
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
            [spMatch],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField]
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
            @spMatch,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplateCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[TemplateCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [UserID]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplate]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplate]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserPrompt nvarchar(MAX),
    @CategoryID int,
    @UserID int,
    @ActiveAt datetime,
    @DisabledAt datetime,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Template]
        (
            [Name],
            [Description],
            [UserPrompt],
            [CategoryID],
            [UserID],
            [ActiveAt],
            [DisabledAt],
            [IsActive]
        )
    VALUES
        (
            @Name,
            @Description,
            @UserPrompt,
            @CategoryID,
            @UserID,
            @ActiveAt,
            @DisabledAt,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplates] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntity]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntity]
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
    @spMatch nvarchar(255),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255)
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
        [spMatch] = @spMatch,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [UpdatedAt] = GETDATE(),
        [PreferredCommunicationField] = @PreferredCommunicationField
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
PRINT N'Creating [__mj].[spUpdateTemplateCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateCategory]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateTemplate]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplate]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserPrompt nvarchar(MAX),
    @CategoryID int,
    @UserID int,
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
        [UserPrompt] = @UserPrompt,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [ActiveAt] = @ActiveAt,
        [DisabledAt] = @DisabledAt,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spDeleteAIModelType]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIModelType]
    @ID int
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
PRINT N'Creating [__mj].[spUpdateRecommendationProvider]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendationProvider]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateTemplateContent]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateContent]
    @ID int,
    @TemplateID int,
    @TypeID int,
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
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateTemplateParam]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateParam]
    @TemplateID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @EntityID int,
    @RecordID nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[TemplateParam]
        (
            [TemplateID],
            [Name],
            [Description],
            [Type],
            [DefaultValue],
            [IsRequired],
            [EntityID],
            [RecordID]
        )
    VALUES
        (
            @TemplateID,
            @Name,
            @Description,
            @Type,
            @DefaultValue,
            @IsRequired,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateParams] WHERE [ID] = SCOPE_IDENTITY()
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
    
    INSERT INTO 
    [__mj].[RecommendationProvider]
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
    SELECT * FROM [__mj].[vwRecommendationProviders] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateTemplateContent]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateContent]
    @TemplateID int,
    @TypeID int,
    @TemplateText nvarchar(MAX),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[TemplateContent]
        (
            [TemplateID],
            [TypeID],
            [TemplateText],
            [Priority],
            [IsActive]
        )
    VALUES
        (
            @TemplateID,
            @TypeID,
            @TemplateText,
            @Priority,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwTemplateContents] WHERE [ID] = SCOPE_IDENTITY()
END
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
PRINT N'Creating [__mj].[spUpdateTemplateContentType]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateContentType]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContentType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateTemplateContentType]'
GO


CREATE PROCEDURE [__mj].[spCreateTemplateContentType]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[TemplateContentType]
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
    SELECT * FROM [__mj].[vwTemplateContentTypes] WHERE [ID] = SCOPE_IDENTITY()
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
PRINT N'Creating [__mj].[spCreateRecommendation]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendation]
    @RecommendationRunID int,
    @SourceEntityID int,
    @SourceEntityRecordID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Recommendation]
        (
            [RecommendationRunID],
            [SourceEntityID],
            [SourceEntityRecordID]
        )
    VALUES
        (
            @RecommendationRunID,
            @SourceEntityID,
            @SourceEntityRecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecommendations] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateTemplateParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateTemplateParam]
    @ID int,
    @TemplateID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @EntityID int,
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
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateRecommendation]'
GO


CREATE PROCEDURE [__mj].[spUpdateRecommendation]
    @ID int,
    @RecommendationRunID int,
    @SourceEntityID int,
    @SourceEntityRecordID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Recommendation]
    SET 
        [RecommendationRunID] = @RecommendationRunID,
        [SourceEntityID] = @SourceEntityID,
        [SourceEntityRecordID] = @SourceEntityRecordID,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateAIModelAction]'
GO


CREATE PROCEDURE [__mj].[spCreateAIModelAction]
    @AIModelID int,
    @AIActionID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[AIModelAction]
        (
            [AIModelID],
            [AIActionID],
            [IsActive]
        )
    VALUES
        (
            @AIModelID,
            @AIActionID,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIModelActions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAIModel]'
GO


CREATE PROCEDURE [__mj].[spCreateAIModel]
    @Name nvarchar(50),
    @Vendor nvarchar(50),
    @AIModelTypeID int,
    @IsActive bit,
    @Description nvarchar(MAX),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @PowerRank int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[AIModel]
        (
            [Name],
            [Vendor],
            [AIModelTypeID],
            [IsActive],
            [Description],
            [DriverClass],
            [DriverImportPath],
            [APIName],
            [PowerRank]
        )
    VALUES
        (
            @Name,
            @Vendor,
            @AIModelTypeID,
            @IsActive,
            @Description,
            @DriverClass,
            @DriverImportPath,
            @APIName,
            @PowerRank
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIModels] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateAIAction]'
GO


CREATE PROCEDURE [__mj].[spCreateAIAction]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultModelID int,
    @DefaultPrompt nvarchar(MAX),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[AIAction]
        (
            [Name],
            [Description],
            [DefaultModelID],
            [DefaultPrompt],
            [IsActive]
        )
    VALUES
        (
            @Name,
            @Description,
            @DefaultModelID,
            @DefaultPrompt,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwAIActions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityAIAction]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityAIAction]
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
    
    INSERT INTO 
    [__mj].[EntityAIAction]
        (
            [EntityID],
            [AIActionID],
            [AIModelID],
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
    VALUES
        (
            @EntityID,
            @AIActionID,
            @AIModelID,
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
    SELECT * FROM [__mj].[vwEntityAIActions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityCommunicationMessageType]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityCommunicationMessageType]
    @EntityID int,
    @BaseMessageTypeID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityCommunicationMessageType]
        (
            [EntityID],
            [BaseMessageTypeID],
            [IsActive]
        )
    VALUES
        (
            @EntityID,
            @BaseMessageTypeID,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityCommunicationMessageTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecommendationRun]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendationRun]
    @RecommendationProviderID int,
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID int
AS
BEGIN
    SET NOCOUNT ON;
    
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
    SELECT * FROM [__mj].[vwRecommendationRuns] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateCommunicationRun]'
GO


ALTER PROCEDURE [__mj].[spCreateCommunicationRun]
    @UserID int,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetime,
    @EndedAt datetime,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
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
    SELECT * FROM [__mj].[vwCommunicationRuns] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateRecommendationItem]'
GO


CREATE PROCEDURE [__mj].[spCreateRecommendationItem]
    @RecommendationID int,
    @DestinationEntityID int,
    @DestinationEntityRecordID nvarchar(MAX),
    @MatchProbability decimal(18, 15)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[RecommendationItem]
        (
            [RecommendationID],
            [DestinationEntityID],
            [DestinationEntityRecordID],
            [MatchProbability]
        )
    VALUES
        (
            @RecommendationID,
            @DestinationEntityID,
            @DestinationEntityRecordID,
            @MatchProbability
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwRecommendationItems] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityCommunicationField]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityCommunicationField]
    @EntityCommunicationMessageTypeID int,
    @FieldName nvarchar(500),
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityCommunicationField]
        (
            [EntityCommunicationMessageTypeID],
            [FieldName],
            [Priority]
        )
    VALUES
        (
            @EntityCommunicationMessageTypeID,
            @FieldName,
            @Priority
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityCommunicationFields] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityCommunicationMessageType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityCommunicationMessageType]
    @ID int,
    @EntityID int,
    @BaseMessageTypeID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationMessageType]
    SET 
        [EntityID] = @EntityID,
        [BaseMessageTypeID] = @BaseMessageTypeID,
        [IsActive] = @IsActive,
        [UpdatedAt] = GETDATE()
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
PRINT N'Adding constraints to [__mj].[TemplateParam]'
GO
ALTER TABLE [__mj].[TemplateParam] ADD CONSTRAINT [CK__TemplatePa__Type__4B6027F5] CHECK (([Type]='Record' OR [Type]='Object' OR [Type]='Array' OR [Type]='Scalar'))
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
PRINT N'Adding foreign keys to [__mj].[RecommendationItem]'
GO
ALTER TABLE [__mj].[RecommendationItem] ADD CONSTRAINT [FK_RecommendationItem_DestinationEntity] FOREIGN KEY ([DestinationEntityID]) REFERENCES [__mj].[Entity] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[TemplateCategory]'
GO
ALTER TABLE [__mj].[TemplateCategory] ADD CONSTRAINT [FK__TemplateC__Paren__66885426] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[TemplateCategory] ([ID])
GO
ALTER TABLE [__mj].[TemplateCategory] ADD CONSTRAINT [FK__TemplateC__UserI__677C785F] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
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
PRINT N'Creating extended properties'
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
	EXEC sp_addextendedproperty N'MS_Description', N'ID of the entity communication message type', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationField', 'COLUMN', N'EntityCommunicationMessageTypeID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'ID of the communication base message type', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationMessageType', 'COLUMN', N'BaseMessageTypeID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'ID of the entity', 'SCHEMA', N'__mj', 'TABLE', N'EntityCommunicationMessageType', 'COLUMN', N'EntityID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'The ID of the destination entity', 'SCHEMA', N'__mj', 'TABLE', N'RecommendationItem', 'COLUMN', N'DestinationEntityID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'Entity ID, used only when Type is Record', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'EntityID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'Record ID, used only when Type is Record', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'RecordID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'ID of the template this parameter belongs to', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'TemplateID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Type of the parameter', 'SCHEMA', N'__mj', 'TABLE', N'TemplateParam', 'COLUMN', N'Type'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, Category that this template is part of', 'SCHEMA', N'__mj', 'TABLE', N'Template', 'COLUMN', N'CategoryID'
END TRY
BEGIN CATCH
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityAIAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAIAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAIAction] TO [cdp_Integration]
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
