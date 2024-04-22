/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.0.6
   TO:   1.0.15
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
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping foreign keys from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [FK_EntityDocument_Entity]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [FK_EntityDocument_EntityDocumentType]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping foreign keys from [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [FK_EntityRecordDocument_Entity]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping foreign keys from [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] DROP CONSTRAINT [FK_EntityDocumentRun_EntityDocument]
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
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [PK_EntityDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [PK_EntityRecordDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [DF_EntityDocument_Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [DF_EntityDocument_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] DROP CONSTRAINT [DF_EntityDocument_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [DF_EntityRecordDocument_CreatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] DROP CONSTRAINT [DF_EntityRecordDocument_UpdatedAt]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping index [UQ_EntityDocument_Name] from [__mj].[EntityDocument]'
GO
DROP INDEX [UQ_EntityDocument_Name] ON [__mj].[EntityDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Rebuilding [__mj].[EntityDocument]'
GO
CREATE TABLE [__mj].[RG_Recovery_1_EntityDocument]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (250) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[EntityID] [int] NOT NULL,
[TypeID] [int] NOT NULL,
[Status] [nvarchar] (15) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityDocument_Status] DEFAULT (N'Pending'),
[Template] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocument_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityDocument_UpdatedAt] DEFAULT (getdate()),
[VectorDatabaseID] [int] NOT NULL,
[AIModelID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
SET IDENTITY_INSERT [__mj].[RG_Recovery_1_EntityDocument] ON
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
INSERT INTO [__mj].[RG_Recovery_1_EntityDocument]([ID], [Name], [EntityID], [TypeID], [Status], [Template], [CreatedAt], [UpdatedAt]) SELECT [ID], [Name], [EntityID], [TypeID], [Status], [Template], [CreatedAt], [UpdatedAt] FROM [__mj].[EntityDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
SET IDENTITY_INSERT [__mj].[RG_Recovery_1_EntityDocument] OFF
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DECLARE @idVal BIGINT
SELECT @idVal = IDENT_CURRENT(N'[__mj].[EntityDocument]')
IF @idVal IS NOT NULL
    DBCC CHECKIDENT(N'[__mj].[RG_Recovery_1_EntityDocument]', RESEED, @idVal)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DROP TABLE [__mj].[EntityDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
EXEC sp_rename N'[__mj].[RG_Recovery_1_EntityDocument]', N'EntityDocument', N'OBJECT'
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
PRINT N'Rebuilding [__mj].[EntityRecordDocument]'
GO
CREATE TABLE [__mj].[RG_Recovery_2_EntityRecordDocument]
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
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityRecordDocument_UpdatedAt] DEFAULT (getdate()),
[EntityDocumentID] [int] NOT NULL
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
SET IDENTITY_INSERT [__mj].[RG_Recovery_2_EntityRecordDocument] ON
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
INSERT INTO [__mj].[RG_Recovery_2_EntityRecordDocument]([ID], [EntityID], [RecordID], [DocumentText], [VectorIndexID], [VectorID], [VectorJSON], [EntityRecordUpdatedAt], [CreatedAt], [UpdatedAt]) SELECT [ID], [EntityID], [RecordID], [DocumentText], [VectorIndexID], [VectorID], [VectorJSON], [EntityRecordUpdatedAt], [CreatedAt], [UpdatedAt] FROM [__mj].[EntityRecordDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
SET IDENTITY_INSERT [__mj].[RG_Recovery_2_EntityRecordDocument] OFF
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DECLARE @idVal BIGINT
SELECT @idVal = IDENT_CURRENT(N'[__mj].[EntityRecordDocument]')
IF @idVal IS NOT NULL
    DBCC CHECKIDENT(N'[__mj].[RG_Recovery_2_EntityRecordDocument]', RESEED, @idVal)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
DROP TABLE [__mj].[EntityRecordDocument]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
EXEC sp_rename N'[__mj].[RG_Recovery_2_EntityRecordDocument]', N'EntityRecordDocument', N'OBJECT'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityRecordDocument] on [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [PK_EntityRecordDocument] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntityRecordDocument]'
GO


ALTER PROCEDURE [__mj].[spCreateEntityRecordDocument]
    @EntityID int,
    @RecordID nvarchar(255),
    @DocumentText nvarchar(MAX),
    @VectorIndexID int,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime,
    @EntityDocumentID int
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
            [EntityRecordUpdatedAt],
            [EntityDocumentID]
        )
    VALUES
        (
            @EntityID,
            @RecordID,
            @DocumentText,
            @VectorIndexID,
            @VectorID,
            @VectorJSON,
            @EntityRecordUpdatedAt,
            @EntityDocumentID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRecordDocuments] WHERE [ID] = SCOPE_IDENTITY()
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
    @AIModelID int
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
            [AIModelID]
        )
    VALUES
        (
            @Name,
            @EntityID,
            @TypeID,
            @Status,
            @Template,
            @VectorDatabaseID,
            @AIModelID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityRecordDocument]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityRecordDocument]
    @ID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @DocumentText nvarchar(MAX),
    @VectorIndexID int,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime,
    @EntityDocumentID int
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
        [UpdatedAt] = GETDATE(),
        [EntityDocumentID] = @EntityDocumentID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityRecordDocuments] WHERE [ID] = @ID
END
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
    @AIModelID int
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
        [UpdatedAt] = GETDATE(),
        [VectorDatabaseID] = @VectorDatabaseID,
        [AIModelID] = @AIModelID
    WHERE 
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT * FROM [__mj].[vwEntityDocuments] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[EntityDocument]'
GO
ALTER TABLE [__mj].[EntityDocument] ADD CONSTRAINT [CK_EntityDocument_Status] CHECK (([Status]='Active' OR [Status]='Inactive'))
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
PRINT N'Adding foreign keys to [__mj].[EntityRecordDocument]'
GO
ALTER TABLE [__mj].[EntityRecordDocument] ADD CONSTRAINT [FK_EntityRecordDocument_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[User]'
GO
ALTER TABLE [__mj].[User] ADD CONSTRAINT [FK_User_Employee] FOREIGN KEY ([EmployeeID]) REFERENCES [__mj].[Employee] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityDocumentRun]'
GO
ALTER TABLE [__mj].[EntityDocumentRun] ADD CONSTRAINT [FK_EntityDocumentRun_EntityDocument] FOREIGN KEY ([EntityDocumentID]) REFERENCES [__mj].[EntityDocument] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateAuditLog]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateAuditLog] TO [cdp_Developer]
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
