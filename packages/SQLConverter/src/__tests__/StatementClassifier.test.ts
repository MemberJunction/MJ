import { describe, it, expect } from 'vitest';
import { classifyBatch } from '../rules/StatementClassifier.js';

describe('StatementClassifier', () => {
  // ============================================================
  // SKIP_SESSION: SQL Server session SET commands
  // ============================================================
  describe('SKIP_SESSION', () => {
    it('should classify SET NUMERIC_ROUNDABORT OFF', () => {
      expect(classifyBatch('SET NUMERIC_ROUNDABORT OFF')).toBe('SKIP_SESSION');
    });

    it('should classify SET ANSI_PADDING ON', () => {
      expect(classifyBatch('SET ANSI_PADDING ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET QUOTED_IDENTIFIER ON', () => {
      expect(classifyBatch('SET QUOTED_IDENTIFIER ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET NOCOUNT ON', () => {
      expect(classifyBatch('SET NOCOUNT ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET NOEXEC OFF', () => {
      expect(classifyBatch('SET NOEXEC OFF')).toBe('SKIP_SESSION');
    });

    it('should classify SET ANSI_WARNINGS ON', () => {
      expect(classifyBatch('SET ANSI_WARNINGS ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET CONCAT_NULL_YIELDS_NULL ON', () => {
      expect(classifyBatch('SET CONCAT_NULL_YIELDS_NULL ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET ARITHABORT ON', () => {
      expect(classifyBatch('SET ARITHABORT ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET XACT_ABORT ON', () => {
      expect(classifyBatch('SET XACT_ABORT ON')).toBe('SKIP_SESSION');
    });

    it('should classify SET ANSI_NULLS ON', () => {
      expect(classifyBatch('SET ANSI_NULLS ON')).toBe('SKIP_SESSION');
    });

    it('should handle leading whitespace on session SET', () => {
      expect(classifyBatch('   SET NOCOUNT ON')).toBe('SKIP_SESSION');
    });
  });

  // ============================================================
  // SKIP_ERROR: IF @@ERROR patterns
  // ============================================================
  describe('SKIP_ERROR', () => {
    it('should classify IF @@ERROR <> 0 SET NOEXEC ON', () => {
      expect(classifyBatch('IF @@ERROR <> 0 SET NOEXEC ON')).toBe('SKIP_ERROR');
    });

    it('should classify IF @@ERROR with extra whitespace', () => {
      expect(classifyBatch('  IF @@ERROR <> 0 SET NOEXEC ON')).toBe('SKIP_ERROR');
    });
  });

  // ============================================================
  // SKIP_SQLSERVER: Server-specific patterns
  // ============================================================
  describe('SKIP_SQLSERVER (non-proc patterns)', () => {
    it('should classify SERVERPROPERTY usage', () => {
      const sql = `IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'MJ_CodeGen')
BEGIN
  IF SERVERPROPERTY('EngineEdition') <> 5
    CREATE LOGIN [MJ_CodeGen] WITH PASSWORD = 'test'
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify sp_executesql usage', () => {
      const sql = `DECLARE @sql NVARCHAR(MAX)
SET @sql = N'CREATE USER [MJ_CodeGen] FOR LOGIN [MJ_CodeGen]'
EXEC sp_executesql @sql`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify sp_executesql even with odd whitespace', () => {
      const sql = `EXEC sp_executesql  @stmt = N'SELECT 1'`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify DECLARE @associate', () => {
      const sql = `DECLARE @associate BIT
SET @associate = 0`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify DECLARE @user_exists', () => {
      const sql = `DECLARE @user_exists BIT
SELECT @user_exists = 1 FROM sys.database_principals WHERE name = 'MJ_CodeGen'`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify DECLARE @role_exists', () => {
      const sql = `DECLARE @role_exists BIT
SELECT @role_exists = 1 FROM sys.database_principals WHERE name = 'cdp_Developer' AND type = 'R'`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify CREATE TYPE as SKIP_SQLSERVER', () => {
      const sql = `CREATE TYPE [__mj].[IDListTableType] AS TABLE (ID UNIQUEIDENTIFIER)`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });
  });

  // ============================================================
  // CREATE_TABLE
  // ============================================================
  describe('CREATE_TABLE', () => {
    it('should classify a basic CREATE TABLE', () => {
      const sql = `CREATE TABLE [__mj].[ActionCategory] (
  [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
  [Name] NVARCHAR(255) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [ParentID] UNIQUEIDENTIFIER NULL,
  [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
  CONSTRAINT [PK_ActionCategory] PRIMARY KEY CLUSTERED ([ID])
)`;
      expect(classifyBatch(sql)).toBe('CREATE_TABLE');
    });

    it('should classify CREATE TABLE with schema prefix', () => {
      const sql = `CREATE TABLE [__mj].[AIModel] (
  [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
  [Name] NVARCHAR(255) NOT NULL,
  [Vendor] NVARCHAR(100) NOT NULL,
  [AIModelTypeID] UNIQUEIDENTIFIER NOT NULL,
  [PowerRank] INT NULL,
  CONSTRAINT [PK_AIModel] PRIMARY KEY ([ID])
)`;
      expect(classifyBatch(sql)).toBe('CREATE_TABLE');
    });
  });

  // ============================================================
  // CREATE_VIEW
  // ============================================================
  describe('CREATE_VIEW', () => {
    it('should classify a basic CREATE VIEW', () => {
      const sql = `CREATE VIEW [__mj].[vwActions]
AS
SELECT
  a.[ID],
  a.[CategoryID],
  a.[Name],
  a.[Description],
  a.[Status],
  ac.[Name] AS [Category]
FROM
  [__mj].[Action] AS a
LEFT JOIN
  [__mj].[ActionCategory] AS ac ON a.[CategoryID] = ac.[ID]`;
      expect(classifyBatch(sql)).toBe('CREATE_VIEW');
    });
  });

  // ============================================================
  // CREATE_PROCEDURE
  // ============================================================
  describe('CREATE_PROCEDURE', () => {
    it('should classify a simple CREATE PROCEDURE', () => {
      const sql = `CREATE PROCEDURE [__mj].[spCreateAction]
  @Name NVARCHAR(255),
  @CategoryID UNIQUEIDENTIFIER,
  @Description NVARCHAR(MAX) = NULL,
  @Status NVARCHAR(20) = 'Pending'
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO [__mj].[Action] ([Name],[CategoryID],[Description],[Status])
  VALUES (@Name, @CategoryID, @Description, @Status)
  SELECT * FROM [__mj].[vwActions] WHERE [ID] = SCOPE_IDENTITY()
END`;
      expect(classifyBatch(sql)).toBe('CREATE_PROCEDURE');
    });

    it('should classify short-form CREATE PROC', () => {
      const sql = `CREATE PROC [__mj].[spUpdateEntityField]
  @ID UNIQUEIDENTIFIER,
  @Name NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE [__mj].[EntityField] SET [Name] = @Name WHERE [ID] = @ID
  SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = @ID
END`;
      expect(classifyBatch(sql)).toBe('CREATE_PROCEDURE');
    });
  });

  // ============================================================
  // SKIP_SQLSERVER for procs with system patterns
  // ============================================================
  describe('SKIP_SQLSERVER (proc patterns)', () => {
    it('should skip proc using SYS.TABLES', () => {
      const sql = `CREATE PROCEDURE [__mj].[spDeleteUnneededEntityFields]
  @EntityID UNIQUEIDENTIFIER
AS
BEGIN
  DECLARE @TableName NVARCHAR(255)
  SELECT @TableName = BaseTable FROM [__mj].[Entity] WHERE ID = @EntityID
  DELETE ef FROM [__mj].[EntityField] ef
  WHERE ef.EntityID = @EntityID
    AND ef.Name NOT IN (SELECT c.name FROM SYS.TABLES t
      INNER JOIN SYS.COLUMNS c ON t.object_id = c.object_id
      WHERE t.name = @TableName)
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc using INTO #temp table', () => {
      const sql = `CREATE PROCEDURE [__mj].[spMergeRecords]
  @EntityName NVARCHAR(255),
  @SurvivingID UNIQUEIDENTIFIER,
  @DuplicateID UNIQUEIDENTIFIER
AS
BEGIN
  SELECT fk.name AS FKName, tp.name AS ParentTable
  INTO #RelatedTables
  FROM sys.foreign_keys fk
  INNER JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
  WHERE fk.referenced_object_id = OBJECT_ID(@EntityName)
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc using @var TABLE(...)', () => {
      const sql = `CREATE PROCEDURE [__mj].[spGetEntityDependencies]
  @EntityName NVARCHAR(255)
AS
BEGIN
  DECLARE @Dependencies TABLE (
    EntityID UNIQUEIDENTIFIER,
    EntityName NVARCHAR(255),
    RelatedEntityID UNIQUEIDENTIFIER
  )
  INSERT INTO @Dependencies
  SELECT e.ID, e.Name, er.RelatedEntityID
  FROM [__mj].[Entity] e
  INNER JOIN [__mj].[EntityRelationship] er ON e.ID = er.EntityID
  WHERE e.Name = @EntityName
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc using STRING_SPLIT', () => {
      const sql = `CREATE PROCEDURE [__mj].[spFilterByList]
  @IDList NVARCHAR(MAX)
AS
BEGIN
  SELECT * FROM [__mj].[Action]
  WHERE ID IN (SELECT CAST(value AS UNIQUEIDENTIFIER) FROM STRING_SPLIT(@IDList, ','))
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc using SP_REFRESHVIEW', () => {
      const sql = `CREATE PROCEDURE [__mj].[spRefreshAllViews]
AS
BEGIN
  DECLARE @ViewName NVARCHAR(255)
  DECLARE view_cursor CURSOR FOR SELECT name FROM sys.views
  OPEN view_cursor
  FETCH NEXT FROM view_cursor INTO @ViewName
  WHILE @@FETCH_STATUS = 0
  BEGIN
    EXEC SP_REFRESHVIEW @ViewName
    FETCH NEXT FROM view_cursor INTO @ViewName
  END
  CLOSE view_cursor
  DEALLOCATE view_cursor
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc using QUOTENAME', () => {
      const sql = `CREATE PROCEDURE [__mj].[spRunDynamicQuery]
  @SchemaName NVARCHAR(255),
  @TableName NVARCHAR(255)
AS
BEGIN
  DECLARE @sql NVARCHAR(MAX)
  SET @sql = N'SELECT * FROM ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName)
  EXEC(@sql)
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc referencing CAREFUL_MOVE', () => {
      const sql = `CREATE PROCEDURE [__mj].[spMoveData]
AS
BEGIN
  -- CAREFUL_MOVE pattern for data migration
  SELECT 1
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should skip proc using SYS.FOREIGN_KEY', () => {
      const sql = `CREATE PROCEDURE [__mj].[spCheckFK]
AS
BEGIN
  SELECT name FROM SYS.FOREIGN_KEY_COLUMNS WHERE parent_object_id = 1
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });
  });

  // ============================================================
  // CREATE_FUNCTION
  // ============================================================
  describe('CREATE_FUNCTION', () => {
    it('should classify a scalar function', () => {
      const sql = `CREATE FUNCTION [__mj].[fnGetUserName](@UserID UNIQUEIDENTIFIER)
RETURNS NVARCHAR(255)
AS
BEGIN
  DECLARE @Name NVARCHAR(255)
  SELECT @Name = Name FROM [__mj].[User] WHERE ID = @UserID
  RETURN @Name
END`;
      expect(classifyBatch(sql)).toBe('CREATE_FUNCTION');
    });

    it('should classify a table-valued function', () => {
      const sql = `CREATE FUNCTION [__mj].[fnGetEntityFields](@EntityID UNIQUEIDENTIFIER)
RETURNS TABLE
AS
RETURN (
  SELECT [ID], [Name], [Type], [Length]
  FROM [__mj].[EntityField]
  WHERE [EntityID] = @EntityID
)`;
      expect(classifyBatch(sql)).toBe('CREATE_FUNCTION');
    });
  });

  // ============================================================
  // CREATE_TRIGGER
  // ============================================================
  describe('CREATE_TRIGGER', () => {
    it('should classify an AFTER UPDATE trigger', () => {
      const sql = `CREATE TRIGGER [__mj].[trgUpdateAction]
ON [__mj].[Action]
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE [__mj].[Action]
  SET __mj_UpdatedAt = GETUTCDATE()
  FROM [__mj].[Action] AS a
  INNER JOIN inserted AS i ON a.ID = i.ID
END`;
      expect(classifyBatch(sql)).toBe('CREATE_TRIGGER');
    });
  });

  // ============================================================
  // ALTER TABLE sub-types
  // ============================================================
  describe('ALTER TABLE sub-types', () => {
    it('should classify FK_CONSTRAINT', () => {
      const sql = `ALTER TABLE [__mj].[ActionParam]
  ADD CONSTRAINT [FK_ActionParam_Action] FOREIGN KEY ([ActionID]) REFERENCES [__mj].[Action]([ID])`;
      expect(classifyBatch(sql)).toBe('FK_CONSTRAINT');
    });

    it('should classify PK_CONSTRAINT', () => {
      const sql = `ALTER TABLE [__mj].[ActionLog]
  ADD CONSTRAINT [PK_ActionLog] PRIMARY KEY CLUSTERED ([ID])`;
      expect(classifyBatch(sql)).toBe('PK_CONSTRAINT');
    });

    it('should classify CHECK_CONSTRAINT', () => {
      const sql = `ALTER TABLE [__mj].[AIModel]
  ADD CONSTRAINT [CK_AIModel_Status] CHECK ([Status] IN ('Active', 'Inactive', 'Deprecated'))`;
      expect(classifyBatch(sql)).toBe('CHECK_CONSTRAINT');
    });

    it('should classify UNIQUE_CONSTRAINT', () => {
      const sql = `ALTER TABLE [__mj].[Entity]
  ADD CONSTRAINT [UQ_Entity_Name_SchemaName] UNIQUE ([Name], [SchemaName])`;
      expect(classifyBatch(sql)).toBe('UNIQUE_CONSTRAINT');
    });

    it('should classify ENABLE_CONSTRAINT (WITH CHECK CHECK CONSTRAINT)', () => {
      const sql = `ALTER TABLE [__mj].[ActionParam] WITH CHECK CHECK CONSTRAINT [FK_ActionParam_Action]`;
      expect(classifyBatch(sql)).toBe('ENABLE_CONSTRAINT');
    });

    it('should classify SKIP_NOCHECK', () => {
      const sql = `ALTER TABLE [__mj].[ActionParam] NOCHECK CONSTRAINT [FK_ActionParam_Action]`;
      expect(classifyBatch(sql)).toBe('SKIP_NOCHECK');
    });

    it('should classify generic ALTER_TABLE for ADD COLUMN', () => {
      const sql = `ALTER TABLE [__mj].[Action] ADD [Priority] INT NULL DEFAULT 0`;
      expect(classifyBatch(sql)).toBe('ALTER_TABLE');
    });

    it('should classify generic ALTER_TABLE for DROP COLUMN', () => {
      const sql = `ALTER TABLE [__mj].[Action] DROP COLUMN [OldField]`;
      expect(classifyBatch(sql)).toBe('ALTER_TABLE');
    });

    it('should classify generic ALTER_TABLE for ALTER COLUMN', () => {
      const sql = `ALTER TABLE [__mj].[Action] ALTER COLUMN [Description] NVARCHAR(MAX) NULL`;
      expect(classifyBatch(sql)).toBe('ALTER_TABLE');
    });
  });

  // ============================================================
  // CREATE_INDEX
  // ============================================================
  describe('CREATE_INDEX', () => {
    it('should classify a basic CREATE INDEX', () => {
      const sql = `CREATE INDEX [IDX_Action_CategoryID] ON [__mj].[Action]([CategoryID])`;
      expect(classifyBatch(sql)).toBe('CREATE_INDEX');
    });

    it('should classify CREATE UNIQUE INDEX', () => {
      const sql = `CREATE UNIQUE INDEX [UQ_Entity_Name] ON [__mj].[Entity]([Name], [SchemaName])`;
      expect(classifyBatch(sql)).toBe('CREATE_INDEX');
    });

    it('should classify CREATE NONCLUSTERED INDEX', () => {
      const sql = `CREATE NONCLUSTERED INDEX [IDX_EntityField_EntityID] ON [__mj].[EntityField]([EntityID]) INCLUDE ([Name], [Type])`;
      expect(classifyBatch(sql)).toBe('CREATE_INDEX');
    });

    it('should classify CREATE UNIQUE NONCLUSTERED INDEX', () => {
      const sql = `CREATE UNIQUE NONCLUSTERED INDEX [UQ_ActionParam_ActionID_Name] ON [__mj].[ActionParam]([ActionID], [Name])`;
      expect(classifyBatch(sql)).toBe('CREATE_INDEX');
    });
  });

  // ============================================================
  // DML: INSERT, UPDATE, DELETE
  // ============================================================
  describe('DML statements', () => {
    it('should classify INSERT INTO', () => {
      const sql = `INSERT INTO [__mj].[Entity] ([ID],[Name],[SchemaName],[BaseTable])
VALUES ('A0B1C2D3-E4F5-6789-ABCD-EF0123456789','Action','__mj','Action')`;
      expect(classifyBatch(sql)).toBe('INSERT');
    });

    it('should classify INSERT without INTO', () => {
      const sql = `INSERT [__mj].[EntityField] ([ID],[EntityID],[Name],[Type])
VALUES ('11111111-2222-3333-4444-555555555555','AABBCCDD-EEFF-0011-2233-445566778899','Name','nvarchar')`;
      expect(classifyBatch(sql)).toBe('INSERT');
    });

    it('should classify UPDATE', () => {
      const sql = `UPDATE [__mj].[Entity]
SET [Description] = 'Updated description',
    [Status] = 'Active'
WHERE [ID] = 'A0B1C2D3-E4F5-6789-ABCD-EF0123456789'`;
      expect(classifyBatch(sql)).toBe('UPDATE');
    });

    it('should classify DELETE', () => {
      const sql = `DELETE FROM [__mj].[ActionLog]
WHERE [CreatedAt] < DATEADD(DAY, -90, GETUTCDATE())`;
      expect(classifyBatch(sql)).toBe('DELETE');
    });
  });

  // ============================================================
  // DCL: GRANT, DENY, REVOKE
  // ============================================================
  describe('DCL statements', () => {
    it('should classify GRANT EXECUTE on a procedure', () => {
      const sql = `GRANT EXECUTE ON [__mj].[spCreateAction] TO [cdp_Developer]`;
      expect(classifyBatch(sql)).toBe('GRANT');
    });

    it('should classify GRANT SELECT on a view', () => {
      const sql = `GRANT SELECT ON [__mj].[vwActions] TO [cdp_UI]`;
      expect(classifyBatch(sql)).toBe('GRANT');
    });

    it('should classify DENY', () => {
      const sql = `DENY DELETE ON [__mj].[Entity] TO [cdp_UI]`;
      expect(classifyBatch(sql)).toBe('DENY');
    });

    it('should classify REVOKE', () => {
      const sql = `REVOKE EXECUTE ON [__mj].[spDeleteAction] FROM [cdp_Developer]`;
      expect(classifyBatch(sql)).toBe('REVOKE');
    });
  });

  // ============================================================
  // SKIP_PRINT
  // ============================================================
  describe('SKIP_PRINT', () => {
    it('should classify PRINT with a string literal', () => {
      expect(classifyBatch("PRINT 'Migration step 1 complete'")).toBe('SKIP_PRINT');
    });

    it('should classify PRINT with N-prefixed string', () => {
      expect(classifyBatch("PRINT(N'Creating MJ schema objects...')")).toBe('SKIP_PRINT');
    });

    it('should classify PRINT with parenthesized argument', () => {
      expect(classifyBatch("PRINT('Done.')")).toBe('SKIP_PRINT');
    });
  });

  // ============================================================
  // EXTENDED_PROPERTY
  // ============================================================
  describe('EXTENDED_PROPERTY', () => {
    it('should classify EXEC sp_addextendedproperty', () => {
      const sql = `EXEC sp_addextendedproperty
  @name = N'MS_Description',
  @value = N'Stores action definitions for the system',
  @level0type = N'SCHEMA', @level0name = N'__mj',
  @level1type = N'TABLE', @level1name = N'Action'`;
      expect(classifyBatch(sql)).toBe('EXTENDED_PROPERTY');
    });

    it('should classify sp_addextendedproperty inside BEGIN TRY', () => {
      const sql = `BEGIN TRY
  EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Action',
    @level2type = N'COLUMN', @level2name = N'ID'
END TRY
BEGIN CATCH
  DECLARE @msg NVARCHAR(MAX) = ERROR_MESSAGE()
END CATCH`;
      expect(classifyBatch(sql)).toBe('EXTENDED_PROPERTY');
    });
  });

  // ============================================================
  // COMMENT_ONLY
  // ============================================================
  describe('COMMENT_ONLY', () => {
    it('should classify a single-line comment', () => {
      expect(classifyBatch('-- This is a migration comment')).toBe('COMMENT_ONLY');
    });

    it('should classify a block comment', () => {
      const sql = `/* ==============================================
   Migration: v5.0 Baseline
   Date: 2026-02-15
   Description: Initial PostgreSQL baseline
   ============================================== */`;
      expect(classifyBatch(sql)).toBe('COMMENT_ONLY');
    });

    it('should classify multiple single-line comments', () => {
      const sql = `-- Step 1: Create schema
-- Step 2: Create tables
-- Step 3: Add constraints`;
      expect(classifyBatch(sql)).toBe('COMMENT_ONLY');
    });

    it('should NOT classify a comment followed by SQL as COMMENT_ONLY', () => {
      const sql = `-- Create the action table
CREATE TABLE [__mj].[Action] (ID UNIQUEIDENTIFIER NOT NULL)`;
      expect(classifyBatch(sql)).not.toBe('COMMENT_ONLY');
    });
  });

  // ============================================================
  // UNKNOWN
  // ============================================================
  describe('UNKNOWN', () => {
    it('should classify unrecognized SQL as UNKNOWN', () => {
      expect(classifyBatch('MERGE INTO [__mj].[SomeTable] USING source ...')).toBe('UNKNOWN');
    });

    it('should classify EXEC calls as SKIP_SQLSERVER', () => {
      expect(classifyBatch('EXEC [__mj].[spSomeCustomProc]')).toBe('SKIP_SQLSERVER');
      expect(classifyBatch('EXEC __mj.spUpdateEntityFieldRelatedEntityNameFieldMap @EntityFieldID=\'abc\'')).toBe('SKIP_SQLSERVER');
    });

    it('should classify DROP VIEW/PROCEDURE/FUNCTION as SKIP_SQLSERVER', () => {
      expect(classifyBatch('DROP VIEW IF EXISTS [__mj].vwEntities')).toBe('SKIP_SQLSERVER');
      expect(classifyBatch('DROP PROCEDURE IF EXISTS [__mj].[spSomeProc]')).toBe('SKIP_SQLSERVER');
      expect(classifyBatch('DROP PROC IF EXISTS __mj.spSomeProc')).toBe('SKIP_SQLSERVER');
      expect(classifyBatch('DROP FUNCTION IF EXISTS [__mj].[fnSomeFunc]')).toBe('SKIP_SQLSERVER');
    });

    it('should classify DROP TABLE as SKIP_SQLSERVER', () => {
      expect(classifyBatch('DROP TABLE #EntityNameMapping;')).toBe('SKIP_SQLSERVER');
      expect(classifyBatch('DROP TABLE IF EXISTS [__mj].[TempData]')).toBe('SKIP_SQLSERVER');
    });

    it('should classify TRUNCATE as UNKNOWN', () => {
      expect(classifyBatch('TRUNCATE TABLE [__mj].[TempData]')).toBe('UNKNOWN');
    });

    it('should classify USE statement as SKIP_SQLSERVER', () => {
      expect(classifyBatch('USE [MemberJunction]')).toBe('SKIP_SQLSERVER');
    });
  });

  // ============================================================
  // Edge cases and mixed patterns
  // ============================================================
  describe('edge cases', () => {
    it('should handle leading newlines before a SET command', () => {
      expect(classifyBatch('\n\n  SET NOCOUNT ON')).toBe('SKIP_SESSION');
    });

    it('should handle tabs and spaces in leading whitespace', () => {
      expect(classifyBatch('\t  CREATE TABLE [__mj].[Foo] (ID INT)')).toBe('CREATE_TABLE');
    });

    it('should not confuse INSERT inside a proc with a top-level INSERT', () => {
      const sql = `CREATE PROCEDURE [__mj].[spCreateEntity]
  @Name NVARCHAR(255)
AS
BEGIN
  INSERT INTO [__mj].[Entity] ([Name]) VALUES (@Name)
END`;
      expect(classifyBatch(sql)).toBe('CREATE_PROCEDURE');
    });

    it('should classify SERVERPROPERTY embedded in a larger block', () => {
      const sql = `IF SERVERPROPERTY('EngineEdition') <> 5
BEGIN
  PRINT 'Not Azure SQL'
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify a proc using SYS.CHECK_CONSTRAINT as SKIP_SQLSERVER', () => {
      const sql = `CREATE PROCEDURE [__mj].[spListCheckConstraints]
AS
BEGIN
  SELECT name FROM SYS.CHECK_CONSTRAINTS WHERE parent_object_id > 0
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify a proc using SYS.COLUMNS as SKIP_SQLSERVER', () => {
      const sql = `CREATE PROCEDURE [__mj].[spGetColumnInfo]
  @TableName NVARCHAR(255)
AS
BEGIN
  SELECT c.name, c.system_type_id
  FROM SYS.COLUMNS c
  INNER JOIN SYS.TABLES t ON c.object_id = t.object_id
  WHERE t.name = @TableName
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify a proc using SYS.OBJECTS as SKIP_SQLSERVER', () => {
      const sql = `CREATE PROCEDURE [__mj].[spCheckObjectExists]
  @Name NVARCHAR(255)
AS
BEGIN
  SELECT 1 FROM SYS.OBJECTS WHERE name = @Name
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify a proc using SYS.SCHEMAS as SKIP_SQLSERVER', () => {
      const sql = `CREATE PROCEDURE [__mj].[spListSchemas]
AS
BEGIN
  SELECT name FROM SYS.SCHEMAS WHERE schema_id > 4
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });

    it('should classify a proc using SYS.VIEWS as SKIP_SQLSERVER', () => {
      const sql = `CREATE PROCEDURE [__mj].[spRefreshViews]
AS
BEGIN
  SELECT name FROM SYS.VIEWS WHERE schema_id = SCHEMA_ID('__mj')
END`;
      expect(classifyBatch(sql)).toBe('SKIP_SQLSERVER');
    });
  });
});
