import { describe, it, expect } from 'vitest';
import { FunctionRule } from '../rules/FunctionRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new FunctionRule();

function convert(sql: string): string {
  const context = createConversionContext('tsql', 'postgres');
  return rule.PostProcess!(sql, sql, context);
}

function convertWithContext(sql: string): { result: string; context: ReturnType<typeof createConversionContext> } {
  const context = createConversionContext('tsql', 'postgres');
  const result = rule.PostProcess!(sql, sql, context);
  return { result, context };
}

describe('FunctionRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('FunctionRule');
      expect(rule.Priority).toBe(35);
      expect(rule.AppliesTo).toEqual(['CREATE_FUNCTION']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('hand-written function replacements', () => {
    it('should return hand-written replacement for StripToAlphanumeric', () => {
      const sql = `CREATE FUNCTION [__mj].[StripToAlphanumeric](@InputString NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    DECLARE @Result NVARCHAR(MAX) = ''
    RETURN @Result
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."StripToAlphanumeric"');
      expect(result).toContain('LANGUAGE plpgsql');
      expect(result).toContain("~ '[A-Za-z0-9]'");
    });

    it('should return hand-written replacement for GetProgrammaticName', () => {
      const sql = `CREATE FUNCTION [__mj].[GetProgrammaticName](@InputString NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN ''
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."GetProgrammaticName"');
      expect(result).toContain('LANGUAGE plpgsql');
    });

    it('should return hand-written replacement for ToTitleCase', () => {
      const sql = `CREATE FUNCTION [__mj].[ToTitleCase](@InputString NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN ''
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."ToTitleCase"');
      expect(result).toContain('INITCAP');
    });

    it('should return hand-written replacement for ToProperCase', () => {
      const sql = `CREATE FUNCTION [__mj].[ToProperCase](@InputString NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN ''
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."ToProperCase"');
      expect(result).toContain('INITCAP');
    });

    it('should return hand-written replacement for ExtractVersionComponents', () => {
      const sql = `CREATE FUNCTION [__mj].[ExtractVersionComponents](@VersionString NVARCHAR(100))
RETURNS TABLE
AS
BEGIN
    RETURN
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."ExtractVersionComponents"');
      expect(result).toContain('STRING_TO_ARRAY');
    });

    it('should return hand-written replacement for parseEmail', () => {
      const sql = `CREATE FUNCTION [__mj].[parseEmail](@Email NVARCHAR(200))
RETURNS NVARCHAR(200)
AS
BEGIN
    RETURN ''
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."parseEmail"');
      expect(result).toContain("POSITION('@' IN");
    });

    it('should return hand-written replacement for parseDomain', () => {
      const sql = `CREATE FUNCTION [__mj].[parseDomain](@url NVARCHAR(500))
RETURNS NVARCHAR(500)
AS
BEGIN
    RETURN ''
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."parseDomain"');
      expect(result).toContain('REGEXP_REPLACE');
    });

    it('should return hand-written replacement for fnInitials', () => {
      const sql = `CREATE FUNCTION [__mj].[fnInitials](@InputString NVARCHAR(MAX))
RETURNS NVARCHAR(50)
AS
BEGIN
    RETURN ''
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."fnInitials"');
      expect(result).toContain('STRING_TO_ARRAY');
    });

    it('should return hand-written replacement for GetClassNameSchemaPrefix', () => {
      const sql = `CREATE FUNCTION [__mj].GetClassNameSchemaPrefix(@schemaName NVARCHAR(255))
RETURNS NVARCHAR(255)
AS
BEGIN
    DECLARE @trimmed NVARCHAR(255) = LTRIM(RTRIM(@schemaName));
    IF LOWER(@trimmed) = '__mj'
        RETURN 'MJ';
    DECLARE @cleaned NVARCHAR(255) = [__mj].StripToAlphanumeric(@trimmed);
    RETURN @cleaned;
END;`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."GetClassNameSchemaPrefix"');
      expect(result).toContain('StripToAlphanumeric');
      expect(result).toContain('LANGUAGE plpgsql');
    });

    it('should not return StripToAlphanumeric when function body calls StripToAlphanumeric', () => {
      const sql = `CREATE FUNCTION [__mj].GetClassNameSchemaPrefix(@schemaName NVARCHAR(255))
RETURNS NVARCHAR(255)
AS
BEGIN
    DECLARE @cleaned NVARCHAR(255) = [__mj].StripToAlphanumeric(@schemaName);
    RETURN @cleaned;
END;`;
      const result = convert(sql);
      // Must NOT return the StripToAlphanumeric hand-written function
      expect(result).toContain('GetClassNameSchemaPrefix');
      expect(result).not.toMatch(/CREATE OR REPLACE FUNCTION __mj\."StripToAlphanumeric"/);
    });

    it('should use context HandWrittenFunctions if set', () => {
      const context = createConversionContext('tsql', 'postgres');
      context.HandWrittenFunctions.set('customfunc', 'CREATE OR REPLACE FUNCTION __mj."CustomFunc"() RETURNS TEXT AS $$ BEGIN RETURN \'custom\'; END; $$ LANGUAGE plpgsql;');
      const sql = `CREATE FUNCTION [__mj].[CustomFunc]()
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN ''
END`;
      const result = rule.PostProcess!(sql, sql, context);
      expect(result).toContain('custom');
    });
  });

  describe('scalar function conversion', () => {
    it('should convert a simple scalar function with simple param types', () => {
      const sql = `CREATE FUNCTION [__mj].[MyScalarFunc](@Input INT)
RETURNS INT
AS
BEGIN
    DECLARE @Result INT;
    SET @Result = @Input
    RETURN @Result
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE FUNCTION __mj."MyScalarFunc"');
      expect(result).toContain('$$ LANGUAGE plpgsql;');
      expect(result).toContain('DECLARE');
      expect(result).toContain('p_Result');
      expect(result).toContain(':=');
    });

    it('should convert @variable references to p_variable', () => {
      const sql = `CREATE FUNCTION [__mj].[TestFunc](@MyVar INT)
RETURNS INT
AS
BEGIN
    RETURN @MyVar + 1
END`;
      const result = convert(sql);
      expect(result).toContain('p_MyVar');
      expect(result).not.toContain('@MyVar');
    });

    it('should convert @@ROWCOUNT to _v_row_count', () => {
      const sql = `CREATE FUNCTION [__mj].[CheckFunc](@ID INT)
RETURNS INT
AS
BEGIN
    IF @@ROWCOUNT > 0
        RETURN 1
    RETURN 0
END`;
      const result = convert(sql);
      expect(result).toContain('_v_row_count');
      expect(result).not.toMatch(/@@ROWCOUNT/i);
    });

    it('should convert @@ERROR to 0', () => {
      const sql = `CREATE FUNCTION [__mj].[ErrFunc](@ID INT)
RETURNS INT
AS
BEGIN
    IF @@ERROR <> 0
        RETURN -1
    RETURN 0
END`;
      const result = convert(sql);
      expect(result).not.toMatch(/@@ERROR/i);
    });
  });

  describe('type conversions', () => {
    it('should convert UNIQUEIDENTIFIER to UUID', () => {
      const sql = `CREATE FUNCTION [__mj].[GetID](@Input UNIQUEIDENTIFIER)
RETURNS UNIQUEIDENTIFIER
AS
BEGIN
    RETURN @Input
END`;
      const result = convert(sql);
      expect(result).toContain('UUID');
      expect(result).not.toMatch(/uniqueidentifier/i);
    });

    it('should convert BIT to BOOLEAN', () => {
      const sql = `CREATE FUNCTION [__mj].[IsValid](@Flag BIT)
RETURNS BIT
AS
BEGIN
    RETURN @Flag
END`;
      const result = convert(sql);
      expect(result).toContain('BOOLEAN');
      expect(result).not.toMatch(/\bbit\b/i);
    });

    it('should convert DATETIMEOFFSET to TIMESTAMPTZ', () => {
      const sql = `CREATE FUNCTION [__mj].[GetTime](@T DATETIMEOFFSET)
RETURNS DATETIMEOFFSET
AS
BEGIN
    RETURN @T
END`;
      const result = convert(sql);
      expect(result).toContain('TIMESTAMPTZ');
      expect(result).not.toMatch(/datetimeoffset/i);
    });

    it('should convert NVARCHAR(MAX) to TEXT', () => {
      const sql = `CREATE FUNCTION [__mj].[GetText](@Input NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN @Input
END`;
      const result = convert(sql);
      expect(result).toContain('TEXT');
    });

    it('should convert TINYINT to SMALLINT', () => {
      const sql = `CREATE FUNCTION [__mj].[GetSmall](@Val TINYINT)
RETURNS TINYINT
AS
BEGIN
    RETURN @Val
END`;
      const result = convert(sql);
      expect(result).toContain('SMALLINT');
      expect(result).not.toMatch(/\btinyint\b/i);
    });
  });

  describe('common function conversions', () => {
    it('should convert ISNULL to COALESCE', () => {
      const sql = `CREATE FUNCTION [__mj].[SafeVal](@Input NVARCHAR(100))
RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN ISNULL(@Input, '')
END`;
      const result = convert(sql);
      expect(result).toContain('COALESCE');
      expect(result).not.toMatch(/\bISNULL\b/i);
    });

    it('should convert GETUTCDATE to NOW', () => {
      const sql = `CREATE FUNCTION [__mj].[GetNow]()
RETURNS DATETIME
AS
BEGIN
    RETURN GETUTCDATE()
END`;
      const result = convert(sql);
      expect(result).toContain('NOW()');
    });

    it('should convert LEN to LENGTH', () => {
      const sql = `CREATE FUNCTION [__mj].[GetLen](@Input NVARCHAR(100))
RETURNS INT
AS
BEGIN
    RETURN LEN(@Input)
END`;
      const result = convert(sql);
      expect(result).toContain('LENGTH(');
      expect(result).not.toMatch(/\bLEN\s*\(/i);
    });

    it('should remove N prefix from string literals', () => {
      const sql = `CREATE FUNCTION [__mj].[GetDefault]()
RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN N'default'
END`;
      const result = convert(sql);
      expect(result).toContain("'default'");
      expect(result).not.toMatch(/(?<![a-zA-Z])N'/);
    });
  });

  describe('control flow conversion', () => {
    it('should convert WHILE BEGIN...END to WHILE...LOOP...END LOOP', () => {
      const sql = `CREATE FUNCTION [__mj].[LoopFunc](@Count INT)
RETURNS INT
AS
BEGIN
    DECLARE @i INT = 0
    WHILE @i < @Count BEGIN
        SET @i = @i + 1
    END;
    RETURN @i
END`;
      const result = convert(sql);
      expect(result).toContain('WHILE');
      expect(result).toContain('LOOP');
    });

    it('should convert SET @var = to p_var :=', () => {
      const sql = `CREATE FUNCTION [__mj].[SetFunc](@Input INT)
RETURNS INT
AS
BEGIN
    DECLARE @Result INT
    SET @Result = @Input * 2
    RETURN @Result
END`;
      const result = convert(sql);
      expect(result).toContain('p_Result :=');
      expect(result).not.toContain('SET p_Result =');
    });
  });

  describe('inline table-valued function conversion', () => {
    it('should convert inline TVF with RETURNS TABLE AS RETURN', () => {
      const sql = `CREATE FUNCTION [__mj].[GetActiveUsers](@Status INT)
RETURNS TABLE
AS
RETURN (SELECT ID, Name AS UserName FROM __mj.Users WHERE Status = @Status)`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."GetActiveUsers"');
      expect(result).toContain('RETURNS TABLE');
      expect(result).toContain('LANGUAGE sql;');
      expect(result).toContain('$$');
    });

    it('should add WITH RECURSIVE for recursive CTEs', () => {
      const sql = `CREATE FUNCTION [__mj].[GetRootID](@ChildID UNIQUEIDENTIFIER)
RETURNS TABLE
AS
RETURN (
    WITH Hierarchy AS (
        SELECT ID, ParentID FROM __mj.Entity WHERE ID = @ChildID
        UNION ALL
        SELECT e.ID, e.ParentID FROM __mj.Entity e JOIN Hierarchy h ON e.ID = h.ParentID
    )
    SELECT ID AS RootID FROM Hierarchy WHERE ParentID IS NULL
)`;
      const result = convert(sql);
      expect(result).toContain('WITH RECURSIVE');
    });
  });

  describe('DECLARE statement extraction', () => {
    it('should extract DECLARE into PG DECLARE block', () => {
      const sql = `CREATE FUNCTION [__mj].[DeclareFunc](@Input INT)
RETURNS INT
AS
BEGIN
    DECLARE @A INT = 0;
    DECLARE @B INT = 5;
    SET @A = @Input
    RETURN @A
END`;
      const result = convert(sql);
      expect(result).toContain('DECLARE');
      expect(result).toContain('p_A');
      expect(result).toContain('p_B');
      expect(result).toContain(':= 0');
      expect(result).toContain(':= 5');
    });
  });

  describe('NCHAR conversion', () => {
    it('should convert NCHAR to CHAR in function body', () => {
      const sql = `CREATE FUNCTION [__mj].[CharFunc](@Input INT)
RETURNS NVARCHAR(10)
AS
BEGIN
    RETURN NCHAR(@Input)
END`;
      const result = convert(sql);
      expect(result).toContain('CHAR(');
      expect(result).not.toMatch(/\bNCHAR\s*\(/i);
    });
  });

  describe('output formatting', () => {
    it('should include $$ LANGUAGE plpgsql for scalar functions', () => {
      const sql = `CREATE FUNCTION [__mj].[SimpleFunc]()
RETURNS INT
AS
BEGIN
    RETURN 1
END`;
      const result = convert(sql);
      expect(result).toContain('$$ LANGUAGE plpgsql;');
    });

    it('should include $$ LANGUAGE sql for inline TVFs', () => {
      const sql = `CREATE FUNCTION [__mj].[SimpleTVF]()
RETURNS TABLE
AS
RETURN (SELECT 1 AS Val)`;
      const result = convert(sql);
      expect(result).toContain('LANGUAGE sql;');
    });

    it('should end output with newline', () => {
      const sql = `CREATE FUNCTION [__mj].[EndFunc]()
RETURNS INT
AS
BEGIN
    RETURN 42
END`;
      const result = convert(sql);
      expect(result).toMatch(/\n$/);
    });
  });
});
