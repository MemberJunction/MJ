import { describe, it, expect } from 'vitest';
import { ProcedureToFunctionRule } from '../rules/ProcedureToFunctionRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new ProcedureToFunctionRule();
const context = createConversionContext('tsql', 'postgres');
// Populate CreatedViews with views referenced by tests
context.CreatedViews.add('vwUsers');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('ProcedureToFunctionRule', () => {
  describe('basic procedure conversion', () => {
    it('should convert a simple CRUD procedure', () => {
      const input = `CREATE PROCEDURE [__mj].[spCreateUser]
    @FirstName nvarchar(100),
    @LastName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[User] ([FirstName], [LastName])
    VALUES (@FirstName, @LastName)

    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = SCOPE_IDENTITY()
END`;

      const result = convert(input);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spCreateUser"');
      expect(result).toContain('p_FirstName');
      expect(result).toContain('p_LastName');
      expect(result).toContain('VARCHAR(100)');
      expect(result).toContain('RETURNS SETOF __mj."vwUsers"');
      expect(result).toContain('$$ LANGUAGE plpgsql;');
      expect(result).not.toContain('SET NOCOUNT ON');
    });

    it('should handle CREATE PROC (short form)', () => {
      const input = `CREATE PROC [__mj].[spGetUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = @ID
END`;

      const result = convert(input);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spGetUser"');
      expect(result).toContain('p_ID UUID');
    });

    it('should handle procedure with no parameters', () => {
      const input = `CREATE PROCEDURE [__mj].[spGetAllUsers]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [__mj].[vwUsers]
END`;

      const result = convert(input);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spGetAllUsers"()');
    });
  });

  describe('parameter conversion', () => {
    it('should convert parameter types', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Active bit,
    @Count int,
    @Amount money,
    @Created datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('p_ID UUID');
      expect(result).toContain('p_Name VARCHAR(100)');
      expect(result).toContain('p_Active BOOLEAN');
      expect(result).toContain('p_Count INTEGER');
      expect(result).toContain('p_Amount NUMERIC(19,4)');
      expect(result).toContain('p_Created TIMESTAMPTZ');
    });

    it('should handle default parameter values', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier,
    @Active bit = 1,
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('p_Active BOOLEAN DEFAULT TRUE');
      // Name should get DEFAULT NULL since it comes after a defaulted param
      expect(result).toContain('p_Name VARCHAR(100) DEFAULT NULL');
    });

    it('should convert OUTPUT params to IN', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('IN p_ID UUID');
      expect(result).not.toContain('INOUT');
    });

    it('should convert BIT default 0 to FALSE', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Active bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('DEFAULT FALSE');
    });
  });

  describe('body conversion', () => {
    it('should convert @variables to p_ prefix', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TempVar nvarchar(100)
    SET @TempVar = @ID
END`;

      const result = convert(input);
      expect(result).toContain('p_TempVar');
      expect(result).toContain('p_ID');
      expect(result).not.toContain('@TempVar');
      expect(result).not.toContain('@ID');
    });

    it('should convert DECLARE to plpgsql DECLARE block', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Count int;
    DECLARE @Name nvarchar(100);
    SET @Count = 0
END`;

      const result = convert(input);
      expect(result).toContain('DECLARE');
      expect(result).toContain('p_Count INTEGER;');
      expect(result).toContain('p_Name VARCHAR(100);');
    });

    it('should convert SET assignments to :=', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Count int;
    SET @Count = 42
END`;

      const result = convert(input);
      expect(result).toContain(':=');
      expect(result).not.toMatch(/\bSET\s+p_Count\s*=/);
    });

    it('should convert ISNULL to COALESCE', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ISNULL(@Name, 'default')
END`;

      const result = convert(input);
      expect(result).toContain('COALESCE(');
      expect(result).not.toContain('ISNULL');
    });

    it('should convert GETUTCDATE to NOW()', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Now datetime;
    SET @Now = GETUTCDATE()
END`;

      const result = convert(input);
      expect(result).toContain('NOW()');
      expect(result).not.toContain('GETUTCDATE');
    });

    it('should convert RAISERROR to RAISE EXCEPTION', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR('Something went wrong', 16, 1);
END`;

      const result = convert(input);
      expect(result).toContain("RAISE EXCEPTION 'Something went wrong'");
    });

    it('should convert ERROR_MESSAGE to SQLERRM', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ERROR_MESSAGE()
END`;

      const result = convert(input);
      expect(result).toContain('SQLERRM');
    });

    it('should remove OUTPUT INSERTED clauses', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[TestTable] ([Name])
    OUTPUT INSERTED.*
    VALUES ('test')
END`;

      const result = convert(input);
      expect(result).not.toContain('OUTPUT INSERTED');
    });

    it('should handle @@ROWCOUNT', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [__mj].[TestTable] SET [Name] = 'test' WHERE [ID] = @ID
    IF @@ROWCOUNT > 0
        SELECT 'success'
END`;

      const result = convert(input);
      expect(result).toContain('_v_row_count');
      expect(result).toContain('_v_row_count INTEGER;');
      expect(result).not.toContain('@@ROWCOUNT');
    });

    it('should convert PRINT to RAISE NOTICE', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    PRINT 'Hello World'
END`;

      const result = convert(input);
      expect(result).toContain("RAISE NOTICE 'Hello World'");
    });

    it('should convert SCOPE_IDENTITY to lastval()', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewID int;
    SET @NewID = SCOPE_IDENTITY()
END`;

      const result = convert(input);
      expect(result).toContain('lastval()');
    });

    it('should convert NEWID to gen_random_uuid()', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewID uniqueidentifier;
    SET @NewID = NEWID()
END`;

      const result = convert(input);
      expect(result).toContain('gen_random_uuid()');
    });

    it('should convert N-prefix strings', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT N'Hello World'
END`;

      const result = convert(input);
      expect(result).toContain("'Hello World'");
      expect(result).not.toMatch(/N'/);
    });

    it('should convert CAST types in body', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(@ID AS UNIQUEIDENTIFIER)
END`;

      const result = convert(input);
      expect(result).toContain('AS UUID');
    });

    it('should convert LEN to LENGTH', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT LEN(@Name)
END`;

      const result = convert(input);
      expect(result).toContain('LENGTH(');
      expect(result).not.toContain('LEN(');
    });
  });

  describe('return type detection', () => {
    it('should detect RETURNS SETOF view', () => {
      const input = `CREATE PROCEDURE [__mj].[spGetUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = @ID
END`;

      const result = convert(input);
      expect(result).toContain('RETURNS SETOF __mj."vwUsers"');
    });

    it('should detect RETURNS TABLE for delete proc', () => {
      const input = `CREATE PROCEDURE [__mj].[spDeleteUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [__mj].[User] WHERE [ID] = @ID
    SELECT @ID AS [ID]
END`;

      const result = convert(input);
      expect(result).toContain('RETURNS TABLE("_result_id" UUID)');
    });

    it('should detect RETURNS VOID when no SELECT', () => {
      const input = `CREATE PROCEDURE [__mj].[spDoSomething]
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [__mj].[Config] SET [Value] = 'test'
END`;

      const result = convert(input);
      expect(result).toContain('RETURNS VOID');
    });
  });

  describe('function structure', () => {
    it('should wrap body in $$ dollar quoting', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('$$');
      expect(result).toContain('$$ LANGUAGE plpgsql;');
    });

    it('should have proper DECLARE/BEGIN/END structure', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @X int;
    SET @X = 1
END`;

      const result = convert(input);
      expect(result).toContain('DECLARE');
      expect(result).toContain('BEGIN');
      expect(result).toMatch(/END\s*$/m);
    });
  });

  describe('edge cases', () => {
    it('should return TODO comment for unparseable proc', () => {
      const input = `CREATE PROCEDURE someWeirdFormat
        that does not match any pattern`;

      const result = convert(input);
      expect(result).toContain('TODO');
    });

    it('should handle COLLATE removal in body', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @Name COLLATE SQL_Latin1_General_CP1_CI_AS
END`;

      const result = convert(input);
      expect(result).not.toContain('COLLATE');
    });

    it('should skip function when referenced view was not created in the file', () => {
      const ctx = createConversionContext('tsql', 'postgres');
      // Do NOT add vwMissingView to ctx.CreatedViews
      const input = `CREATE PROCEDURE [__mj].[spCreateMissing]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[MissingTable] ([Name]) VALUES (@Name)
    SELECT * FROM [__mj].[vwMissingView] WHERE [ID] = SCOPE_IDENTITY()
END`;

      const result = rule.PostProcess!(input, input, ctx);
      expect(result).toContain('SKIPPED');
      expect(result).toContain('vwMissingView');
      expect(result).not.toContain('CREATE OR REPLACE FUNCTION');
    });

    it('should convert suser_sname() to current_user', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SUSER_SNAME()
END`;

      const result = convert(input);
      expect(result).toContain('current_user');
    });
  });
});
