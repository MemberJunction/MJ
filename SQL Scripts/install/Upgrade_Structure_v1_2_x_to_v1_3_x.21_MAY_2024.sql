/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.2.x
   TO:   1.3.x
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
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [CK_EntityDocument_Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [DF_EntityDocument_Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Entity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD
[spMatch] [nvarchar] (255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DuplicateRun]'
GO
CREATE TABLE [__mj].[DuplicateRun]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[StartedByUserID] [int] NOT NULL,
[StartedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRun_StartedAt] DEFAULT (getdate()),
[EndedAt] [datetime] NULL,
[ApprovalStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRun_ApprovalStatus] DEFAULT (N'Pending'),
[ApprovalComments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ApprovedByUserID] [int] NULL,
[ProcessingStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRun_ProcessingStatus] DEFAULT (N'Pending'),
[ProcessingErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[SourceListID] [int] NOT NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRun_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRun_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DuplicateRun] on [__mj].[DuplicateRun]'
GO
ALTER TABLE [__mj].[DuplicateRun] ADD CONSTRAINT [PK_DuplicateRun] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DuplicateRunDetail]'
GO
CREATE TABLE [__mj].[DuplicateRunDetail]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[DuplicateRunID] [int] NOT NULL,
[RecordID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MatchStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetail_MatchStatus] DEFAULT (N'Pending'),
[SkippedReason] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[MatchErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[MergeStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetail_MergeStatus] DEFAULT (N'Not Applicable'),
[MergeErrorMessage] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetail_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetail_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DuplicateRunDetail] on [__mj].[DuplicateRunDetail]'
GO
ALTER TABLE [__mj].[DuplicateRunDetail] ADD CONSTRAINT [PK_DuplicateRunDetail] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[DuplicateRunDetailMatch]'
GO
CREATE TABLE [__mj].[DuplicateRunDetailMatch]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[DuplicateRunDetailID] [int] NOT NULL,
[MatchSource] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MatchSource] DEFAULT (N'Vector'),
[MatchRecordID] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[MatchProbability] [numeric] (12, 11) NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MatchProbability] DEFAULT ((0)),
[MatchedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MatchedAt] DEFAULT (getdate()),
[Action] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_Action] DEFAULT (N'Ignore'),
[ApprovalStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_ApprovalStatus] DEFAULT (N'Pending'),
[MergeStatus] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MergeStatus] DEFAULT (N'Pending'),
[MergedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_MergedAt] DEFAULT (getdate()),
[RecordMergeLogID] [int] NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_DuplicateRunDetailMatch_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_DuplicateRunDetailMatch] on [__mj].[DuplicateRunDetailMatch]'
GO
ALTER TABLE [__mj].[DuplicateRunDetailMatch] ADD CONSTRAINT [PK_DuplicateRunDetailMatch] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[EntityDocument]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocument] ADD
[PotentialMatchThreshold] [numeric] (12, 11) NOT NULL CONSTRAINT [DF_EntityDocument_PotentialMatchThreshold] DEFAULT ((1)),
[AbsoluteMatchThreshold] [numeric] (12, 11) NOT NULL CONSTRAINT [DF_EntityDocument_AbsoluteMatchTreshhold] DEFAULT ((1))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [DF_EntityDocument_Status] DEFAULT (N'Active') FOR [Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityDocumentSetting]'
GO
CREATE TABLE [__mj].[EntityDocumentSetting]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityDocumentID] [int] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocumentSetting_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocumentSetting_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityDocumentSetting] on [__mj].[EntityDocumentSetting]'
GO
ALTER TABLE [__mj].[EntityDocumentSetting] ADD CONSTRAINT [PK_EntityDocumentSetting] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntitySetting]'
GO
CREATE TABLE [__mj].[EntitySetting]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntitySetting_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntitySetting_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntitySetting] on [__mj].[EntitySetting]'
GO
ALTER TABLE [__mj].[EntitySetting] ADD CONSTRAINT [PK_EntitySetting] PRIMARY KEY CLUSTERED ([ID])
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
PRINT N'Creating [__mj].[spUpdateDuplicateRunDetail]'
GO


CREATE PROCEDURE [__mj].[spUpdateDuplicateRunDetail]
    @ID int,
    @DuplicateRunID int,
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
        [MergeErrorMessage] = @MergeErrorMessage,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDuplicateRunDetails] WHERE [ID] = @ID
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
PRINT N'Creating [__mj].[spUpdateEntitySetting]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntitySetting]
    @ID int,
    @EntityID int,
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
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntitySettings] WHERE [ID] = @ID
END
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
    User_ApprovedByUserID.[Name] AS [ApprovedByUser],
    List_SourceListID.[Name] AS [SourceList]
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
LEFT OUTER JOIN
    [__mj].[User] AS User_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
INNER JOIN
    [__mj].[List] AS List_SourceListID
  ON
    [d].[SourceListID] = List_SourceListID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDuplicateRun]'
GO


CREATE PROCEDURE [__mj].[spUpdateDuplicateRun]
    @ID int,
    @EntityID int,
    @StartedByUserID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID int,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX),
    @SourceListID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRun]
    SET 
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage,
        [SourceListID] = @SourceListID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDuplicateRuns] WHERE [ID] = @ID
END
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
PRINT N'Creating [__mj].[spUpdateEntityDocumentSetting]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityDocumentSetting]
    @ID int,
    @EntityDocumentID int,
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
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentSettings] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntityDocument]'
GO


ALTER PROCEDURE [__mj].[spCreateEntityDocument]
    @Name nvarchar(250),
    @EntityID int,
    @TypeID int,
    @Status nvarchar(15),
    @Template nvarchar(MAX),
    @VectorDatabaseID int,
    @AIModelID int,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
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
            [Template],
            [VectorDatabaseID],
            [AIModelID],
            [PotentialMatchThreshold],
            [AbsoluteMatchThreshold]
        )
    VALUES
        (
            @Name,
            @EntityID,
            @TypeID,
            @Status,
            @Template,
            @VectorDatabaseID,
            @AIModelID,
            @PotentialMatchThreshold,
            @AbsoluteMatchThreshold
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[vwSQLColumnsAndEntityFields]'
GO
ALTER VIEW [__mj].[vwSQLColumnsAndEntityFields]
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
PRINT N'Altering [__mj].[spUpdateEntityDocument]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityDocument]
    @ID int,
    @Name nvarchar(250),
    @EntityID int,
    @TypeID int,
    @Status nvarchar(15),
    @Template nvarchar(MAX),
    @VectorDatabaseID int,
    @AIModelID int,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
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
        [VectorDatabaseID] = @VectorDatabaseID,
        [AIModelID] = @AIModelID,
        [PotentialMatchThreshold] = @PotentialMatchThreshold,
        [AbsoluteMatchThreshold] = @AbsoluteMatchThreshold,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteDataContextItem]'
GO


CREATE PROCEDURE [__mj].[spDeleteDataContextItem]
    @ID int
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
PRINT N'Creating [__mj].[spDeleteDataContext]'
GO


CREATE PROCEDURE [__mj].[spDeleteDataContext]
    @ID int
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
PRINT N'Creating [__mj].[spCreateDuplicateRunDetailMatch]'
GO


CREATE PROCEDURE [__mj].[spCreateDuplicateRunDetailMatch]
    @DuplicateRunDetailID int,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetime,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @MergeStatus nvarchar(20),
    @MergedAt datetime,
    @RecordMergeLogID int
AS
BEGIN
    SET NOCOUNT ON;
    
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
            [MergeStatus],
            [MergedAt],
            [RecordMergeLogID]
        )
    VALUES
        (
            @DuplicateRunDetailID,
            @MatchSource,
            @MatchRecordID,
            @MatchProbability,
            @MatchedAt,
            @Action,
            @ApprovalStatus,
            @MergeStatus,
            @MergedAt,
            @RecordMergeLogID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDuplicateRunDetailMatches] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateDuplicateRunDetailMatch]'
GO


CREATE PROCEDURE [__mj].[spUpdateDuplicateRunDetailMatch]
    @ID int,
    @DuplicateRunDetailID int,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetime,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @MergeStatus nvarchar(20),
    @MergedAt datetime,
    @RecordMergeLogID int
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
        [MergeStatus] = @MergeStatus,
        [MergedAt] = @MergedAt,
        [RecordMergeLogID] = @RecordMergeLogID,
        [UpdatedAt] = GETDATE()
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwDuplicateRunDetailMatches] WHERE [ID] = @ID
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
            [spMatch],
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
            @spMatch,
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
        [spMatch] = @spMatch,
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
PRINT N'Creating [__mj].[spCreateEntitySetting]'
GO


CREATE PROCEDURE [__mj].[spCreateEntitySetting]
    @EntityID int,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntitySetting]
        (
            [EntityID],
            [Name],
            [Value],
            [Comments]
        )
    VALUES
        (
            @EntityID,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntitySettings] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDuplicateRunDetail]'
GO


CREATE PROCEDURE [__mj].[spCreateDuplicateRunDetail]
    @DuplicateRunID int,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
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
    SELECT * FROM [__mj].[vwDuplicateRunDetails] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityDocumentSetting]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityDocumentSetting]
    @EntityDocumentID int,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityDocumentSetting]
        (
            [EntityDocumentID],
            [Name],
            [Value],
            [Comments]
        )
    VALUES
        (
            @EntityDocumentID,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocumentSettings] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateDuplicateRun]'
GO


CREATE PROCEDURE [__mj].[spCreateDuplicateRun]
    @EntityID int,
    @StartedByUserID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID int,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX),
    @SourceListID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[DuplicateRun]
        (
            [EntityID],
            [StartedByUserID],
            [StartedAt],
            [EndedAt],
            [ApprovalStatus],
            [ApprovalComments],
            [ApprovedByUserID],
            [ProcessingStatus],
            [ProcessingErrorMessage],
            [SourceListID]
        )
    VALUES
        (
            @EntityID,
            @StartedByUserID,
            @StartedAt,
            @EndedAt,
            @ApprovalStatus,
            @ApprovalComments,
            @ApprovedByUserID,
            @ProcessingStatus,
            @ProcessingErrorMessage,
            @SourceListID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwDuplicateRuns] WHERE [ID] = SCOPE_IDENTITY()
END
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
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [FK_EntityDocument_VectorDatabase] FOREIGN KEY ([VectorDatabaseID]) REFERENCES [__mj].[VectorDatabase] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntitySetting]'
GO
ALTER TABLE [__mj].[EntitySetting] ADD CONSTRAINT [FK_EntitySetting_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating extended properties'
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
PRINT N'Altering permissions on  [__mj].[spCreateEntityDocumentSetting]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityDocumentSetting] TO [cdp_Integration]
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
PRINT N'Altering permissions on  [__mj].[spUpdateEntityDocumentSetting]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityDocumentSetting] TO [cdp_Integration]
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
