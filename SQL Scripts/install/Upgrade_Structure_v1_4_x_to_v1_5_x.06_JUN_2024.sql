/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.4.x
   TO:   1.5.x
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
PRINT N'Creating [__mj].[ActionCategory]'
GO
CREATE TABLE [__mj].[ActionCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__ActionCat__Statu__6DA65A4E] DEFAULT ('Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionCat__Creat__6F8EA2C0] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionCat__Updat__7082C6F9] DEFAULT (getdate())
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
PRINT N'Creating [__mj].[Action]'
GO
CREATE TABLE [__mj].[Action]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CategoryID] [int] NULL,
[Name] [nvarchar] (425) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserPrompt] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Code] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeApprovalStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Action__CodeAppr__745357DD] DEFAULT (N'Pending'),
[CodeApprovalComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeApprovedByUserID] [int] NULL,
[CodeApprovedAt] [datetime] NULL,
[ForceCodeGeneration] [bit] NOT NULL CONSTRAINT [DF_Action_ForceGeneration] DEFAULT ((0)),
[RetentionPeriod] [int] NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Action__Status__763BA04F] DEFAULT (N'Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Action__CreatedA__7823E8C1] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Action__UpdatedA__79180CFA] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Action__3214EC270C9982D3] on [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [PK__Action__3214EC270C9982D3] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Action]'
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [UQ_Action_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionAuthorization]'
GO
CREATE TABLE [__mj].[ActionAuthorization]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ActionID] [int] NOT NULL,
[AuthorizationName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionAut__Creat__7DDCC217] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionAut__Updat__7ED0E650] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionAu__3214EC27820EA1B9] on [__mj].[ActionAuthorization]'
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD CONSTRAINT [PK__ActionAu__3214EC27820EA1B9] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionContext]'
GO
CREATE TABLE [__mj].[ActionContext]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ActionID] [int] NOT NULL,
[ContextTypeID] [int] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__ActionCon__Statu__12D7DEFD] DEFAULT ('Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionCon__Creat__14C0276F] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionCon__Updat__15B44BA8] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionCo__3214EC27F0238939] on [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [PK__ActionCo__3214EC27F0238939] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionContextType]'
GO
CREATE TABLE [__mj].[ActionContextType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionCon__Creat__0F074E19] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionCon__Updat__0FFB7252] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionCo__3214EC27CC3D83B0] on [__mj].[ActionContextType]'
GO
ALTER TABLE [__mj].[ActionContextType] ADD CONSTRAINT [PK__ActionCo__3214EC27CC3D83B0] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionExecutionLog]'
GO
CREATE TABLE [__mj].[ActionExecutionLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ActionID] [int] NOT NULL,
[StartedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionExe__Start__38FD87E5] DEFAULT (getdate()),
[EndedAt] [datetime] NULL,
[Params] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ResultCode] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[UserID] [int] NOT NULL,
[RetentionPeriod] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionExe__Creat__39F1AC1E] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionExe__Updat__3AE5D057] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionEx__3214EC27FBE8864D] on [__mj].[ActionExecutionLog]'
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD CONSTRAINT [PK__ActionEx__3214EC27FBE8864D] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionLibrary]'
GO
CREATE TABLE [__mj].[ActionLibrary]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ActionID] [int] NOT NULL,
[LibraryID] [int] NOT NULL,
[ItemsUsed] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionLib__Creat__7BAB2C39] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionLib__Updat__7C9F5072] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionLi__3214EC2738BA7706] on [__mj].[ActionLibrary]'
GO
ALTER TABLE [__mj].[ActionLibrary] ADD CONSTRAINT [PK__ActionLi__3214EC2738BA7706] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[Library]'
GO
CREATE TABLE [__mj].[Library]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Library__Status__740A0A71] DEFAULT ('Pending'),
[ExportedItems] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TypeDefinitions] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SampleCode] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Library__Created__75F252E3] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Library__Updated__76E6771C] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Library__3214EC27EDC27C05] on [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] ADD CONSTRAINT [PK__Library__3214EC27EDC27C05] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] ADD CONSTRAINT [UQ_Library_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionParam]'
GO
CREATE TABLE [__mj].[ActionParam]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ActionID] [int] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[DefaultValue] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Type] [nchar] (10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ValueType] [nvarchar] (30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[IsArray] [bit] NOT NULL CONSTRAINT [DF__ActionPar__IsArr__714CCE00] DEFAULT ((0)),
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IsRequired] [bit] NOT NULL CONSTRAINT [DF__ActionPar__IsReq__7240F239] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionPar__Creat__73351672] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionPar__Updat__74293AAB] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ActionParam] on [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [PK_ActionParam] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionResultCode]'
GO
CREATE TABLE [__mj].[ActionResultCode]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ActionID] [int] NOT NULL,
[ResultCode] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionRes__Creat__3FAA8574] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionRes__Updat__409EA9AD] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionRe__3214EC27B642E470] on [__mj].[ActionResultCode]'
GO
ALTER TABLE [__mj].[ActionResultCode] ADD CONSTRAINT [PK__ActionRe__3214EC27B642E470] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationProvider]'
GO
CREATE TABLE [__mj].[CommunicationProvider]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Communica__Statu__602F90FB] DEFAULT ('Disabled'),
[SupportsSending] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__6217D96D] DEFAULT ((1)),
[SupportsReceiving] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__630BFDA6] DEFAULT ((0)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Creat__640021DF] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Updat__64F44618] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Communic__3214EC2760311597] on [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] ADD CONSTRAINT [PK__Communic__3214EC2760311597] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationProvider]'
GO
ALTER TABLE [__mj].[CommunicationProvider] ADD CONSTRAINT [UQ_CommunicationProvider_Name] UNIQUE NONCLUSTERED ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationLog]'
GO
CREATE TABLE [__mj].[CommunicationLog]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CommunicationProviderID] [int] NOT NULL,
[CommunicationProviderMessageTypeID] [int] NOT NULL,
[CommunicationRunID] [int] NULL,
[Direction] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MessageDate] [datetime] NOT NULL,
[Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MessageContent] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Creat__046CF171] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Updat__056115AA] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Communic__3214EC27E3C81D53] on [__mj].[CommunicationLog]'
GO
ALTER TABLE [__mj].[CommunicationLog] ADD CONSTRAINT [PK__Communic__3214EC27E3C81D53] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationProviderMessageType]'
GO
CREATE TABLE [__mj].[CommunicationProviderMessageType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[CommunicationProviderID] [int] NOT NULL,
[CommunicationBaseMessageTypeID] [int] NOT NULL,
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__Communica__Statu__6F71D48B] DEFAULT ('Disabled'),
[AdditionalAttributes] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Creat__715A1CFD] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Updat__724E4136] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Communic__3214EC27B648D5E5] on [__mj].[CommunicationProviderMessageType]'
GO
ALTER TABLE [__mj].[CommunicationProviderMessageType] ADD CONSTRAINT [PK__Communic__3214EC27B648D5E5] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationRun]'
GO
CREATE TABLE [__mj].[CommunicationRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserID] [int] NOT NULL,
[Direction] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Creat__7DBFF3E2] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Updat__7EB4181B] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Communic__3214EC278F4632D4] on [__mj].[CommunicationRun]'
GO
ALTER TABLE [__mj].[CommunicationRun] ADD CONSTRAINT [PK__Communic__3214EC278F4632D4] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[CommunicationBaseMessageType]'
GO
CREATE TABLE [__mj].[CommunicationBaseMessageType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Type] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[SupportsAttachments] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__68C4D6FC] DEFAULT ((0)),
[SupportsSubjectLine] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__69B8FB35] DEFAULT ((0)),
[SupportsHtml] [bit] NOT NULL CONSTRAINT [DF__Communica__Suppo__6AAD1F6E] DEFAULT ((0)),
[MaxBytes] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Creat__6BA143A7] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Updat__6C9567E0] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Communic__3214EC2725FCF1D7] on [__mj].[CommunicationBaseMessageType]'
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] ADD CONSTRAINT [PK__Communic__3214EC2725FCF1D7] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[CommunicationBaseMessageType]'
GO
ALTER TABLE [__mj].[CommunicationBaseMessageType] ADD CONSTRAINT [UQ_CommunicationBaseMessageType_Type] UNIQUE NONCLUSTERED ([Type])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityAction]'
GO
CREATE TABLE [__mj].[EntityAction]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[ActionID] [int] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__EntityAct__Statu__1E4991A9] DEFAULT ('Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Creat__2031DA1B] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Updat__2125FE54] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityAc__3214EC272A3AECFC] on [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [PK__EntityAc__3214EC272A3AECFC] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ActionFilter]'
GO
CREATE TABLE [__mj].[ActionFilter]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[UserDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[UserComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[Code] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[CodeExplanation] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionFil__Creat__1A7900C5] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__ActionFil__Updat__1B6D24FE] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ActionFi__3214EC274DCDB744] on [__mj].[ActionFilter]'
GO
ALTER TABLE [__mj].[ActionFilter] ADD CONSTRAINT [PK__ActionFi__3214EC274DCDB744] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionFilter]'
GO
CREATE TABLE [__mj].[EntityActionFilter]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityActionID] [int] NOT NULL,
[ActionFilterID] [int] NOT NULL,
[Sequence] [int] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__EntityAct__Statu__25EAB371] DEFAULT ('Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Creat__27D2FBE3] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Updat__28C7201C] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityAc__3214EC27ED093DB2] on [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [PK__EntityAc__3214EC27ED093DB2] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionInvocation]'
GO
CREATE TABLE [__mj].[EntityActionInvocation]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityActionID] [int] NOT NULL,
[InvocationTypeID] [int] NOT NULL,
[Status] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF__EntityAct__Statu__315C661D] DEFAULT ('Pending'),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Creat__3344AE8F] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Updat__3438D2C8] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityAc__3214EC27AF7EA3A4] on [__mj].[EntityActionInvocation]'
GO
ALTER TABLE [__mj].[EntityActionInvocation] ADD CONSTRAINT [PK__EntityAc__3214EC27AF7EA3A4] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityActionInvocationType]'
GO
CREATE TABLE [__mj].[EntityActionInvocationType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DisplaySequence] [int] NOT NULL CONSTRAINT [DF_EntityActionInvocationType_DisplaySequence] DEFAULT ((0)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Creat__2D8BD539] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__EntityAct__Updat__2E7FF972] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__EntityAc__3214EC2700F9E4F0] on [__mj].[EntityActionInvocationType]'
GO
ALTER TABLE [__mj].[EntityActionInvocationType] ADD CONSTRAINT [PK__EntityAc__3214EC2700F9E4F0] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[WorkspaceItem]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkspaceItem] ADD
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_WorkspaceItem_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_WorkspaceItem_UpdatedAt] DEFAULT (getdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[WorkspaceItem] ALTER COLUMN [ResourceRecordID] [nvarchar] (2000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Workspace]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Workspace] ADD
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_Workspace_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_Workspace_UpdatedAt] DEFAULT (getdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[List]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[List] ADD
[CategoryID] [int] NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[List] ALTER COLUMN [EntityID] [int] NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityField]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD
[CodeType] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
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
INNER JOIN
    [__mj].[ActionContextType] AS ActionContextType_ContextTypeID
  ON
    [a].[ContextTypeID] = ActionContextType_ContextTypeID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionContext]'
GO


CREATE PROCEDURE [__mj].[spCreateActionContext]
    @ActionID int,
    @ContextTypeID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionContext]
        (
            [ActionID],
            [ContextTypeID],
            [Status]
        )
    VALUES
        (
            @ActionID,
            @ContextTypeID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionContexts] WHERE [ID] = SCOPE_IDENTITY()
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
PRINT N'Creating [__mj].[spUpdateCommunicationRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationRun]
    @ID int,
    @UserID int,
    @Direction nvarchar(20),
    @Status nvarchar(20),
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
PRINT N'Creating [__mj].[spCreateActionParam]'
GO


CREATE PROCEDURE [__mj].[spCreateActionParam]
    @ActionID int,
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
    SELECT * FROM [__mj].[vwActionParams] WHERE [ID] = SCOPE_IDENTITY()
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
PRINT N'Creating [__mj].[spCreateActionResultCode]'
GO


CREATE PROCEDURE [__mj].[spCreateActionResultCode]
    @ActionID int,
    @ResultCode nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionResultCode]
        (
            [ActionID],
            [ResultCode],
            [Description]
        )
    VALUES
        (
            @ActionID,
            @ResultCode,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionResultCodes] WHERE [ID] = SCOPE_IDENTITY()
END
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
PRINT N'Altering [__mj].[vwLists]'
GO


ALTER VIEW [__mj].[vwLists]
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
PRINT N'Altering [__mj].[spUpdateList]'
GO


ALTER PROCEDURE [__mj].[spUpdateList]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID int,
    @UserID int,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID int,
    @CategoryID int
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
        [UpdatedAt] = GETDATE(),
        [CategoryID] = @CategoryID
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
PRINT N'Creating [__mj].[spCreateActionExecutionLog]'
GO


CREATE PROCEDURE [__mj].[spCreateActionExecutionLog]
    @ActionID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Params nvarchar(MAX),
    @ResultCode nvarchar(255),
    @UserID int,
    @RetentionPeriod int
AS
BEGIN
    SET NOCOUNT ON;
    
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
    SELECT * FROM [__mj].[vwActionExecutionLogs] WHERE [ID] = SCOPE_IDENTITY()
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
PRINT N'Creating [__mj].[spCreateActionCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateActionCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [Status]
        )
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityField]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityField]
    @ID int,
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
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateActionContext]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionContext]
    @ID int,
    @ActionID int,
    @ContextTypeID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContext]
    SET 
        [ActionID] = @ActionID,
        [ContextTypeID] = @ContextTypeID,
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateEntityAction]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityAction]
    @EntityID int,
    @ActionID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityAction]
        (
            [EntityID],
            [ActionID],
            [Status]
        )
    VALUES
        (
            @EntityID,
            @ActionID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityActionInvocation]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionInvocation]
    @EntityActionID int,
    @InvocationTypeID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityActionInvocation]
        (
            [EntityActionID],
            [InvocationTypeID],
            [Status]
        )
    VALUES
        (
            @EntityActionID,
            @InvocationTypeID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionInvocations] WHERE [ID] = SCOPE_IDENTITY()
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
PRINT N'Creating [__mj].[spUpdateActionContextType]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionContextType]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContextType]
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
                                        [__mj].[vwActionContextTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionParam]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionParam]
    @ID int,
    @ActionID int,
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
        [IsRequired] = @IsRequired,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateActionResultCode]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionResultCode]
    @ID int,
    @ActionID int,
    @ResultCode nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        [ActionID] = @ActionID,
        [ResultCode] = @ResultCode,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateActionCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionCategory]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
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
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateActionExecutionLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionExecutionLog]
    @ID int,
    @ActionID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Params nvarchar(MAX),
    @ResultCode nvarchar(255),
    @UserID int,
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
        [RetentionPeriod] = @RetentionPeriod,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateEntityActionInvocation]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionInvocation]
    @ID int,
    @EntityActionID int,
    @InvocationTypeID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocation]
    SET 
        [EntityActionID] = @EntityActionID,
        [InvocationTypeID] = @InvocationTypeID,
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spDeleteActionContext]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionContext]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteActionParam]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionParam]
    @ID int
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
PRINT N'Creating [__mj].[spUpdateEntityAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityAction]
    @ID int,
    @EntityID int,
    @ActionID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAction]
    SET 
        [EntityID] = @EntityID,
        [ActionID] = @ActionID,
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spDeleteActionContextType]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionContextType]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteActionResultCode]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionResultCode]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteActionExecutionLog]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionExecutionLog]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteActionCategory]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionCategory]
    @ID int
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
PRINT N'Altering [__mj].[spCreateWorkspaceItem]'
GO


ALTER PROCEDURE [__mj].[spCreateWorkspaceItem]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkSpaceID int,
    @ResourceTypeID int,
    @ResourceRecordID nvarchar(2000),
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
PRINT N'Creating [__mj].[spDeleteEntityActionInvocation]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionInvocation]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteEntityAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityAction]
    @ID int
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
PRINT N'Creating [__mj].[CommunicationTemplate]'
GO
CREATE TABLE [__mj].[CommunicationTemplate]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Content] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[ParentID] [int] NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Creat__7712F653] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF__Communica__Updat__78071A8C] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__Communic__3214EC27A0F9E4AD] on [__mj].[CommunicationTemplate]'
GO
ALTER TABLE [__mj].[CommunicationTemplate] ADD CONSTRAINT [PK__Communic__3214EC27A0F9E4AD] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwCommunicationTemplates]'
GO


CREATE VIEW [__mj].[vwCommunicationTemplates]
AS
SELECT 
    c.*,
    CommunicationTemplate_ParentID.[Name] AS [Parent]
FROM
    [__mj].[CommunicationTemplate] AS c
LEFT OUTER JOIN
    [__mj].[CommunicationTemplate] AS CommunicationTemplate_ParentID
  ON
    [c].[ParentID] = CommunicationTemplate_ParentID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateWorkspaceItem]'
GO


ALTER PROCEDURE [__mj].[spUpdateWorkspaceItem]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkSpaceID int,
    @ResourceTypeID int,
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
        [WorkSpaceID] = @WorkSpaceID,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [Sequence] = @Sequence,
        [Configuration] = @Configuration,
        [UpdatedAt] = GETDATE()
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
PRINT N'Altering [__mj].[spUpdateWorkspace]'
GO


ALTER PROCEDURE [__mj].[spUpdateWorkspace]
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
        [UserID] = @UserID,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spDeleteEntityAIAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityAIAction]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteAIAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIAction]
    @ID int
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
PRINT N'Creating [__mj].[ListCategory]'
GO
CREATE TABLE [__mj].[ListCategory]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ParentID] [int] NULL,
[CreatedAt] [datetime] NOT NULL,
[UpdatedAt] [datetime] NOT NULL,
[UserID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK__ListCate__3214EC27709AE471] on [__mj].[ListCategory]'
GO
ALTER TABLE [__mj].[ListCategory] ADD CONSTRAINT [PK__ListCate__3214EC27709AE471] PRIMARY KEY CLUSTERED ([ID])
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
PRINT N'Creating [__mj].[spDeleteAIModelAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteAIModelAction]
    @ID int
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
PRINT N'Creating [__mj].[spCreateActionLibrary]'
GO


CREATE PROCEDURE [__mj].[spCreateActionLibrary]
    @ActionID int,
    @LibraryID int,
    @ItemsUsed nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionLibrary]
        (
            [ActionID],
            [LibraryID],
            [ItemsUsed]
        )
    VALUES
        (
            @ActionID,
            @LibraryID,
            @ItemsUsed
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionLibraries] WHERE [ID] = SCOPE_IDENTITY()
END
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
PRINT N'Creating [__mj].[spCreateLibrary]'
GO


CREATE PROCEDURE [__mj].[spCreateLibrary]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @ExportedItems nvarchar(MAX),
    @TypeDefinitions nvarchar(MAX),
    @SampleCode nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Library]
        (
            [Name],
            [Description],
            [Status],
            [ExportedItems],
            [TypeDefinitions],
            [SampleCode]
        )
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @ExportedItems,
            @TypeDefinitions,
            @SampleCode
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLibraries] WHERE [ID] = SCOPE_IDENTITY()
END
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
    
    INSERT INTO 
    [__mj].[EntityActionInvocationType]
        (
            [Name],
            [Description],
            [DisplaySequence]
        )
    VALUES
        (
            @Name,
            @Description,
            @DisplaySequence
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionInvocationTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCommunicationTemplate]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationTemplate]
    @Name nvarchar(255),
    @Content nvarchar(MAX),
    @ParentID int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[CommunicationTemplate]
        (
            [Name],
            [Content],
            [ParentID],
            [Comments]
        )
    VALUES
        (
            @Name,
            @Content,
            @ParentID,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationTemplates] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateActionAuthorization]'
GO


CREATE PROCEDURE [__mj].[spCreateActionAuthorization]
    @ActionID int,
    @AuthorizationName nvarchar(100),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionAuthorization]
        (
            [ActionID],
            [AuthorizationName],
            [Comments]
        )
    VALUES
        (
            @ActionID,
            @AuthorizationName,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionAuthorizations] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateListCategory]'
GO


CREATE PROCEDURE [__mj].[spCreateListCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ListCategory]
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
    SELECT * FROM [__mj].[vwListCategories] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityActionFilter]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityActionFilter]
    @EntityActionID int,
    @ActionFilterID int,
    @Sequence int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityActionFilter]
        (
            [EntityActionID],
            [ActionFilterID],
            [Sequence],
            [Status]
        )
    VALUES
        (
            @EntityActionID,
            @ActionFilterID,
            @Sequence,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityActionFilters] WHERE [ID] = SCOPE_IDENTITY()
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
    
    INSERT INTO 
    [__mj].[CommunicationProvider]
        (
            [Name],
            [Description],
            [Status],
            [SupportsSending],
            [SupportsReceiving]
        )
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @SupportsSending,
            @SupportsReceiving
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationProviders] WHERE [ID] = SCOPE_IDENTITY()
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
    
    INSERT INTO 
    [__mj].[ActionFilter]
        (
            [UserDescription],
            [UserComments],
            [Code],
            [CodeExplanation]
        )
    VALUES
        (
            @UserDescription,
            @UserComments,
            @Code,
            @CodeExplanation
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActionFilters] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateActionLibrary]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionLibrary]
    @ID int,
    @ActionID int,
    @LibraryID int,
    @ItemsUsed nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionLibrary]
    SET 
        [ActionID] = @ActionID,
        [LibraryID] = @LibraryID,
        [ItemsUsed] = @ItemsUsed,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateAction]'
GO


CREATE PROCEDURE [__mj].[spCreateAction]
    @CategoryID int,
    @Name nvarchar(425),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID int,
    @CodeApprovedAt datetime,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Action]
        (
            [CategoryID],
            [Name],
            [UserPrompt],
            [UserComments],
            [Code],
            [CodeComments],
            [CodeApprovalStatus],
            [CodeApprovalComments],
            [CodeApprovedByUserID],
            [CodeApprovedAt],
            [ForceCodeGeneration],
            [RetentionPeriod],
            [Status]
        )
    VALUES
        (
            @CategoryID,
            @Name,
            @UserPrompt,
            @UserComments,
            @Code,
            @CodeComments,
            @CodeApprovalStatus,
            @CodeApprovalComments,
            @CodeApprovedByUserID,
            @CodeApprovedAt,
            @ForceCodeGeneration,
            @RetentionPeriod,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwActions] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateLibrary]'
GO


CREATE PROCEDURE [__mj].[spUpdateLibrary]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @ExportedItems nvarchar(MAX),
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
        [ExportedItems] = @ExportedItems,
        [TypeDefinitions] = @TypeDefinitions,
        [SampleCode] = @SampleCode,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateEntityActionInvocationType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionInvocationType]
    @ID int,
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
        [DisplaySequence] = @DisplaySequence,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateCommunicationTemplate]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationTemplate]
    @ID int,
    @Name nvarchar(255),
    @Content nvarchar(MAX),
    @ParentID int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationTemplate]
    SET 
        [Name] = @Name,
        [Content] = @Content,
        [ParentID] = @ParentID,
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationTemplates] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityActionFilter]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityActionFilter]
    @ID int,
    @EntityActionID int,
    @ActionFilterID int,
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
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateCommunicationProvider]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationProvider]
    @ID int,
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
        [SupportsReceiving] = @SupportsReceiving,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateAction]'
GO


CREATE PROCEDURE [__mj].[spUpdateAction]
    @ID int,
    @CategoryID int,
    @Name nvarchar(425),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID int,
    @CodeApprovedAt datetime,
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
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spUpdateListCategory]'
GO


CREATE PROCEDURE [__mj].[spUpdateListCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UpdatedAt] = GETDATE(),
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
PRINT N'Creating [__mj].[spUpdateActionFilter]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionFilter]
    @ID int,
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
        [CodeExplanation] = @CodeExplanation,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spDeleteActionLibrary]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionLibrary]
    @ID int
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
PRINT N'Creating [__mj].[spUpdateActionAuthorization]'
GO


CREATE PROCEDURE [__mj].[spUpdateActionAuthorization]
    @ID int,
    @ActionID int,
    @AuthorizationName nvarchar(100),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionAuthorization]
    SET 
        [ActionID] = @ActionID,
        [AuthorizationName] = @AuthorizationName,
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spDeleteEntityActionInvocationType]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionInvocationType]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteEntityActionFilter]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityActionFilter]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteAction]'
GO


CREATE PROCEDURE [__mj].[spDeleteAction]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteActionFilter]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionFilter]
    @ID int
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
PRINT N'Creating [__mj].[spCreateCommunicationProviderMessageType]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationProviderMessageType]
    @CommunicationProviderID int,
    @CommunicationBaseMessageTypeID int,
    @Name nvarchar(255),
    @Status nvarchar(20),
    @AdditionalAttributes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[CommunicationProviderMessageType]
        (
            [CommunicationProviderID],
            [CommunicationBaseMessageTypeID],
            [Name],
            [Status],
            [AdditionalAttributes]
        )
    VALUES
        (
            @CommunicationProviderID,
            @CommunicationBaseMessageTypeID,
            @Name,
            @Status,
            @AdditionalAttributes
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationProviderMessageTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteActionAuthorization]'
GO


CREATE PROCEDURE [__mj].[spDeleteActionAuthorization]
    @ID int
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
PRINT N'Creating [__mj].[spCreateCommunicationLog]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationLog]
    @CommunicationProviderID int,
    @CommunicationProviderMessageTypeID int,
    @CommunicationRunID int,
    @Direction nvarchar(20),
    @MessageDate datetime,
    @Status nvarchar(50),
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
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
    SELECT * FROM [__mj].[vwCommunicationLogs] WHERE [ID] = SCOPE_IDENTITY()
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
    
    INSERT INTO 
    [__mj].[CommunicationBaseMessageType]
        (
            [Type],
            [SupportsAttachments],
            [SupportsSubjectLine],
            [SupportsHtml],
            [MaxBytes]
        )
    VALUES
        (
            @Type,
            @SupportsAttachments,
            @SupportsSubjectLine,
            @SupportsHtml,
            @MaxBytes
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationBaseMessageTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateCommunicationRun]'
GO


CREATE PROCEDURE [__mj].[spCreateCommunicationRun]
    @UserID int,
    @Direction nvarchar(20),
    @Status nvarchar(20),
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
            [Comments],
            [ErrorMessage]
        )
    VALUES
        (
            @UserID,
            @Direction,
            @Status,
            @Comments,
            @ErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwCommunicationRuns] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCommunicationLog]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationLog]
    @ID int,
    @CommunicationProviderID int,
    @CommunicationProviderMessageTypeID int,
    @CommunicationRunID int,
    @Direction nvarchar(20),
    @MessageDate datetime,
    @Status nvarchar(50),
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
        [ErrorMessage] = @ErrorMessage,
        [UpdatedAt] = GETDATE()
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
PRINT N'Altering [__mj].[spCreateList]'
GO


ALTER PROCEDURE [__mj].[spCreateList]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID int,
    @UserID int,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID int,
    @CategoryID int
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
            [CompanyIntegrationID],
            [CategoryID]
        )
    VALUES
        (
            @Name,
            @Description,
            @EntityID,
            @UserID,
            @ExternalSystemRecordID,
            @CompanyIntegrationID,
            @CategoryID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwLists] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCommunicationProviderMessageType]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationProviderMessageType]
    @ID int,
    @CommunicationProviderID int,
    @CommunicationBaseMessageTypeID int,
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
        [AdditionalAttributes] = @AdditionalAttributes,
        [UpdatedAt] = GETDATE()
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
PRINT N'Creating [__mj].[spCreateActionContextType]'
GO


CREATE PROCEDURE [__mj].[spCreateActionContextType]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ActionContextType]
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
    SELECT * FROM [__mj].[vwActionContextTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateCommunicationBaseMessageType]'
GO


CREATE PROCEDURE [__mj].[spUpdateCommunicationBaseMessageType]
    @ID int,
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
        [MaxBytes] = @MaxBytes,
        [UpdatedAt] = GETDATE()
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
PRINT N'Altering [__mj].[spCreateEntityField]'
GO


ALTER PROCEDURE [__mj].[spCreateEntityField]
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
            @RelatedEntityNameFieldMap
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = SCOPE_IDENTITY()
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
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [CK__Action__CodeAppr__75477C16] CHECK (([CodeApprovalStatus]='Rejected' OR [CodeApprovalStatus]='Approved' OR [CodeApprovalStatus]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [CK__Action__Status__772FC488] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
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
PRINT N'Adding constraints to [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [CK__EntityAct__Statu__1F3DB5E2] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityField]'
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_EntityField_CodeType] CHECK (([CodeType]='Other' OR [CodeType]='JavaScript' OR [CodeType]='CSS' OR [CodeType]='HTML' OR [CodeType]='SQL' OR [CodeType]='TypeScript'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_EntityField_ExtendedType] CHECK (([ExtendedType]='Other' OR [ExtendedType]='ZoomMtg' OR [ExtendedType]='MSTeams' OR [ExtendedType]='SIP' OR [ExtendedType]='Skype' OR [ExtendedType]='FaceTime' OR [ExtendedType]='WhatsApp' OR [ExtendedType]='Geo' OR [ExtendedType]='SMS' OR [ExtendedType]='Tel' OR [ExtendedType]='Code' OR [ExtendedType]='URL' OR [ExtendedType]='Email'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_GeneratedFormSection] CHECK (([GeneratedFormSection]='Details' OR [GeneratedFormSection]='Category' OR [GeneratedFormSection]='Top'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityField] ADD CONSTRAINT [CK_ValueListType] CHECK (([ValueListType]='ListOrUserEntry' OR [ValueListType]='List' OR [ValueListType]='None'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[Library]'
GO
ALTER TABLE [__mj].[Library] ADD CONSTRAINT [CK__Library__Status__74FE2EAA] CHECK (([Status]='Disabled' OR [Status]='Active' OR [Status]='Pending'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionAuthorization]'
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD CONSTRAINT [FK__ActionAut__Actio__7FC50A89] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionAuthorization] ADD CONSTRAINT [FK_ActionAuthorization_Authorization] FOREIGN KEY ([AuthorizationName]) REFERENCES [__mj].[Authorization] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionCategory]'
GO
ALTER TABLE [__mj].[ActionCategory] ADD CONSTRAINT [FK__ActionCat__Paren__7176EB32] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[ActionCategory] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionContext]'
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [FK__ActionCon__Actio__16A86FE1] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionContext] ADD CONSTRAINT [FK__ActionCon__Conte__179C941A] FOREIGN KEY ([ContextTypeID]) REFERENCES [__mj].[ActionContextType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionExecutionLog]'
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD CONSTRAINT [FK__ActionExe__Actio__3BD9F490] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionExecutionLog] ADD CONSTRAINT [FK__ActionExe__UserI__3CCE18C9] FOREIGN KEY ([UserID]) REFERENCES [__mj].[User] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionLibrary]'
GO
ALTER TABLE [__mj].[ActionLibrary] ADD CONSTRAINT [FK__ActionLib__Actio__79C2E3C7] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[ActionLibrary] ADD CONSTRAINT [FK__ActionLib__Libra__7AB70800] FOREIGN KEY ([LibraryID]) REFERENCES [__mj].[Library] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ActionParam]'
GO
ALTER TABLE [__mj].[ActionParam] ADD CONSTRAINT [FK__ActionPar__Actio__6E706155] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
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
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [FK__Action__Category__7A0C3133] FOREIGN KEY ([CategoryID]) REFERENCES [__mj].[ActionCategory] ([ID])
GO
ALTER TABLE [__mj].[Action] ADD CONSTRAINT [FK__Action__CodeAppr__7B00556C] FOREIGN KEY ([CodeApprovedByUserID]) REFERENCES [__mj].[User] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[CommunicationTemplate]'
GO
ALTER TABLE [__mj].[CommunicationTemplate] ADD CONSTRAINT [FK__Communica__Paren__78FB3EC5] FOREIGN KEY ([ParentID]) REFERENCES [__mj].[CommunicationTemplate] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityActionFilter]'
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [FK__EntityAct__Actio__2AAF688E] FOREIGN KEY ([ActionFilterID]) REFERENCES [__mj].[ActionFilter] ([ID])
GO
ALTER TABLE [__mj].[EntityActionFilter] ADD CONSTRAINT [FK__EntityAct__Entit__29BB4455] FOREIGN KEY ([EntityActionID]) REFERENCES [__mj].[EntityAction] ([ID])
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
PRINT N'Adding foreign keys to [__mj].[EntityAction]'
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [FK__EntityAct__Actio__230E46C6] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action] ([ID])
GO
ALTER TABLE [__mj].[EntityAction] ADD CONSTRAINT [FK__EntityAct__Entit__221A228D] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating extended properties'
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
	EXEC sp_addextendedproperty N'ms_description', N'Parent category ID for hierarchical organization.', 'SCHEMA', N'__mj', 'TABLE', N'ActionCategory', 'COLUMN', N'ParentID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'Tracks the list of libraries that a given Action uses, including a list of classes/functions for each library.', 'SCHEMA', N'__mj', 'TABLE', N'ActionLibrary', NULL, NULL
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'ms_description', N'UserID who approved the code.', 'SCHEMA', N'__mj', 'TABLE', N'Action', 'COLUMN', N'CodeApprovedByUserID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'Reusable templates for communication.', 'SCHEMA', N'__mj', 'TABLE', N'CommunicationTemplate', NULL, NULL
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'Link to the entity this field points to if it is a foreign key (auto maintained by CodeGen)', 'SCHEMA', N'__mj', 'TABLE', N'EntityField', 'COLUMN', N'RelatedEntityID'
END TRY
BEGIN CATCH
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
	EXEC sp_addextendedproperty N'MS_Description', N'List of classes and functions exported by the library.', 'SCHEMA', N'__mj', 'TABLE', N'Library', 'COLUMN', N'ExportedItems'
END TRY
BEGIN CATCH
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
PRINT N'Altering permissions on  [__mj].[spCreateCommunicationTemplate]'
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationTemplate] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateCommunicationTemplate] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityAction]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spDeleteEntityAction]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateCommunicationTemplate]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationTemplate] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateCommunicationTemplate] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateEntityAction]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityAction] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityAction] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[vwCommunicationTemplates]'
GO
GRANT SELECT ON  [__mj].[vwCommunicationTemplates] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwCommunicationTemplates] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwCommunicationTemplates] TO [cdp_UI]
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
