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
      // (Plain `[...]` can appear in PG array syntax inside the view-wrapper DO
      // block, so we rely on the positive assertions above to prove the T-SQL
      // bracket identifiers were converted.)
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
    it('should wrap view in DO block with exception-based CASCADE fallback', () => {
      const sql = `CREATE OR ALTER VIEW [__mj].[vwFoo] AS
SELECT [ID] FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toContain('DO $do$');
      expect(result).toContain('EXECUTE vsql');
      expect(result).toContain('EXCEPTION WHEN invalid_table_definition');
      expect(result).toContain('DROP VIEW IF EXISTS');
      expect(result).toContain('CASCADE');
      expect(result).toContain('CREATE OR REPLACE VIEW');
      expect(result).toContain('$do$;');
      expect(result).not.toMatch(/CREATE\s+OR\s+ALTER\s+VIEW/i);
    });

    it('should use same DO block pattern regardless of HasDDLChanges', () => {
      const ddlContext = createConversionContext('tsql', 'postgres');
      ddlContext.HasDDLChanges = true;
      const sql = `CREATE OR ALTER VIEW [__mj].[vwFoo] AS
SELECT [ID] FROM [__mj].[Foo]`;
      const result = rule.PostProcess!(sql, sql, ddlContext);
      // Same DO block pattern whether or not DDL changes are present
      expect(result).toContain('DO $do$');
      expect(result).toContain('EXCEPTION WHEN invalid_table_definition');
      expect(result).toContain('DROP VIEW IF EXISTS');
      expect(result).toContain('CASCADE');
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

    it('should also quote lowercase "as PascalAlias" (regression: vwEntityPermissions had "as RoleName")', () => {
      // SQL Server source for vwEntityPermissions used lowercase "as RoleName".
      // Pre-fix: the regex was case-sensitive on the AS keyword and missed this,
      // so PG ended up with `"Role_RoleName"."Name" as RoleName` — PG case-folded
      // RoleName to rolename, breaking every runtime query against the view.
      const sql = `CREATE VIEW [__mj].[vwEntityPermissions] AS
SELECT
    Role_RoleName.Name as RoleName,
    Role_RoleName.[SQLName] as [RoleSQLName]
FROM [__mj].[EntityPermission]`;
      const result = convert(sql);
      expect(result).toContain('as "RoleName"');
      expect(result).not.toMatch(/\bas RoleName\b/);
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

  describe('mixed-case table aliases', () => {
    // A view's related-entity aliases are written bare in the T-SQL source and referenced bare.
    // Quoting only ONE side leaves the definition case-preserved while every reference folds to
    // lowercase, so the alias cannot resolve and the whole view fails to create.
    it('should quote references to an alias whose definition it quoted', () => {
      const sql = `CREATE VIEW [__mj].[vwPayments] AS
SELECT p.*, mjCommonPerson_PayerID.[DisplayName] AS [Payer]
FROM [__mj].[Payment] AS p
INNER JOIN [__mj].[Person] AS mjCommonPerson_PayerID
  ON [p].[PayerID] = mjCommonPerson_PayerID.[ID]`;
      const result = convert(sql);
      expect(result).toContain('"mjCommonPerson_PayerID"."DisplayName"');
      expect(result).toContain('"mjCommonPerson_PayerID"."ID"');
      // No half-quoted survivors: never a bare alias followed by a quoted column.
      expect(result).not.toMatch(/(?<!")\bmjCommonPerson_PayerID\./);
    });

    it('should leave references to an implicit (no AS) mixed-case alias unquoted', () => {
      // MJ's baseline views introduce aliases WITHOUT the AS keyword — `__mj."vwEntities"
      // relatedEntity`. Only `AS <alias>` definitions get quoted, so an implicit definition folds
      // to lowercase; quoting its references makes the alias unresolvable. Verified live: with the
      // references quoted, the converted __mj.vwEntityRelationships from B202602151200__v5.0__
      // Baseline.sql fails on PG 17 with `missing FROM-clause entry for table "relatedEntity"`.
      const sql = `CREATE VIEW [__mj].[vwEntityRelationships] AS
SELECT er.*, relatedEntity.[Name] AS [RelatedEntity]
FROM [__mj].[EntityRelationship] er
INNER JOIN [__mj].[vwEntities] relatedEntity
  ON [er].[RelatedEntityID] = relatedEntity.[ID]`;
      const result = convert(sql);
      expect(result).toContain('relatedEntity."Name"');
      expect(result).toContain('relatedEntity."ID"');
      expect(result).not.toContain('"relatedEntity"');
    });

    it('should leave an all-lowercase alias unquoted', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT p.[ID] FROM [__mj].[Payment] AS p`;
      const result = convert(sql);
      expect(result).toContain('p."ID"');
      expect(result).not.toContain('"p"');
    });
  });

  describe('placeholder-composed schema names', () => {
    // An open app references a sibling app's schema through a migration placeholder. The
    // placeholder is substituted as plain text at apply time, so quoting it produces a
    // case-preserved schema that does not exist — every real schema is created folded.
    it('should leave a schema built from a placeholder unquoted', () => {
      const sql = `CREATE VIEW [__mj].[vwFoo] AS
SELECT x.[ID] FROM [\${mjSchema}_BizAppsCommon].[Person] AS x`;
      const result = convert(sql);
      expect(result).toContain('${mjSchema}_BizAppsCommon."Person"');
      expect(result).not.toContain('"${mjSchema}_BizAppsCommon"');
    });
  });

  describe('output formatting', () => {
    it('should ensure DO block output ends with $do$; and newline', () => {
      const sql = `CREATE VIEW [__mj].[vwSimple] AS
SELECT [ID] FROM [__mj].[Foo]`;
      const result = convert(sql);
      expect(result).toMatch(/\$do\$;\n$/);
    });
  });
});
