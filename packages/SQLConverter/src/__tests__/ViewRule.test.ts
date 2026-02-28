import { describe, it, expect } from 'vitest';
import { ViewRule } from '../rules/ViewRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new ViewRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('ViewRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('ViewRule');
      expect(rule.Priority).toBe(20);
      expect(rule.AppliesTo).toEqual(['CREATE_VIEW']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('identifier conversion', () => {
    it('should convert bracket identifiers in a simple view', () => {
      const sql = `CREATE VIEW [__mj].[vwUsers] AS
SELECT [ID], [Name], [Email]
FROM [__mj].[Users]`;
      const result = convert(sql);
      expect(result).toContain('__mj."vwUsers"');
      expect(result).toContain('"ID"');
      expect(result).toContain('"Name"');
      expect(result).toContain('__mj."Users"');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });
  });

  describe('ISNULL to COALESCE', () => {
    it('should convert ISNULL to COALESCE', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT ISNULL([Name], 'Unknown') AS [DisplayName]
FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toContain('COALESCE(');
      expect(result).not.toMatch(/\bISNULL\s*\(/i);
    });
  });

  describe('APPLY to LATERAL conversion', () => {
    it('should convert OUTER APPLY to LEFT JOIN LATERAL', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT f.[ID], b.[Val]
FROM [__mj].[Foo] f
OUTER APPLY (SELECT TOP 1 [Val] FROM [__mj].[Bar] WHERE [FooID] = f.[ID]) b`;
      const result = convert(sql);
      expect(result).toContain('LEFT JOIN LATERAL');
      expect(result).not.toMatch(/OUTER\s+APPLY/i);
    });

    it('should convert CROSS APPLY to CROSS JOIN LATERAL', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT f.[ID], b.[Val]
FROM [__mj].[Foo] f
CROSS APPLY (SELECT TOP 1 [Val] FROM [__mj].[Bar] WHERE [FooID] = f.[ID]) b`;
      const result = convert(sql);
      expect(result).toContain('CROSS JOIN LATERAL');
      expect(result).not.toMatch(/CROSS\s+APPLY/i);
    });
  });

  describe('schema normalization', () => {
    it('should normalize schema references to __mj."TableName" format', () => {
      const sql = `CREATE VIEW [__mj].[vwTest] AS
SELECT [ID]
FROM [__mj].[TestTable]`;
      const result = convert(sql);
      // Should use __mj."TableName" format, not "__mj".TableName
      expect(result).toContain('__mj."TestTable"');
    });
  });

  describe('skip views with sys.* references', () => {
    it('should skip views that reference sys.* objects', () => {
      const sql = `CREATE VIEW [__mj].[vwSystemInfo] AS
SELECT name FROM sys.objects WHERE type = 'U'`;
      const result = convert(sql);
      expect(result).toContain('SKIPPED');
      expect(result).toContain('SQL Server system tables');
    });
  });

  describe('CREATE OR ALTER VIEW conversion', () => {
    it('should emit CREATE OR REPLACE VIEW without DROP CASCADE when no DDL changes', () => {
      const sql = `CREATE OR ALTER VIEW [__mj].[vwFoo] AS
SELECT [ID] FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).not.toContain('DROP VIEW IF EXISTS');
      expect(result).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW/i);
      expect(result).not.toMatch(/CREATE\s+OR\s+ALTER\s+VIEW/i);
    });

    it('should emit DROP VIEW CASCADE + CREATE OR REPLACE VIEW when DDL changes present', () => {
      const ddlContext = createConversionContext('tsql', 'postgres');
      ddlContext.HasDDLChanges = true;
      const sql = `CREATE OR ALTER VIEW [__mj].[vwFoo] AS
SELECT [ID] FROM [__mj].[Foo]`;
      const result = rule.PostProcess!(sql, sql, ddlContext);
      expect(result).toContain('DROP VIEW IF EXISTS');
      expect(result).toContain('CASCADE');
      expect(result).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW/i);
    });
  });

  describe('N-prefix removal', () => {
    it('should remove N prefix from string literals in views', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT [ID], N'Active' AS [Status]
FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toContain("'Active'");
      expect(result).not.toMatch(/(?<![a-zA-Z])N'/);
    });
  });

  describe('TOP to LIMIT conversion', () => {
    it('should convert SELECT TOP N to SELECT ... LIMIT N', () => {
      const sql = `CREATE VIEW [__mj].[vwTop5] AS
SELECT TOP 5 [ID], [Name]
FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toContain('LIMIT 5');
      expect(result).not.toMatch(/\bTOP\s+5\b/i);
    });
  });

  describe('PascalCase alias quoting', () => {
    it('should quote AS PascalAlias to AS "PascalAlias"', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT [Name] AS DisplayName
FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toContain('AS "DisplayName"');
    });

    it('should not quote SQL keywords used as aliases', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT COUNT(*) AS COUNT
FROM [__mj].[Foo]`;
      const result = convert(sql);
      // COUNT is a keyword, should remain unquoted
      expect(result).toContain('AS COUNT');
      expect(result).not.toContain('AS "COUNT"');
    });
  });

  describe('flyway references', () => {
    it('should skip views that reference flyway', () => {
      const sql = `CREATE VIEW [__mj].[vwMigrations] AS
SELECT * FROM flyway_schema_history`;
      const result = convert(sql);
      expect(result).toContain('SKIPPED');
      expect(result).toContain('Flyway');
    });
  });

  describe('output formatting', () => {
    it('should ensure output ends with semicolon and newline', () => {
      const sql = `CREATE VIEW [__mj].[vwSimple] AS
SELECT [ID] FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });
  });
});
