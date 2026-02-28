import { describe, it, expect } from 'vitest';
import { InsertRule } from '../rules/InsertRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new InsertRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('InsertRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('InsertRule');
      expect(rule.Priority).toBe(50);
      expect(rule.AppliesTo).toEqual(['INSERT', 'UPDATE', 'DELETE']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('identifier conversion', () => {
    it('should convert bracket identifiers in a simple INSERT', () => {
      const sql = "INSERT INTO [__mj].[Users] ([Name], [Email]) VALUES ('Alice', 'alice@example.com')";
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('"Name"');
      expect(result).toContain('"Email"');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });
  });

  describe('N-prefix removal', () => {
    it('should remove N prefix from string literals', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Name]) VALUES (N'Hello World')";
      const result = convert(sql);
      expect(result).toContain("'Hello World'");
      expect(result).not.toMatch(/(?<![a-zA-Z])N'/);
    });

    it('should NOT corrupt words containing N like JOIN, IN, ON', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Name]) VALUES (N'JOIN IN ON')";
      const result = convert(sql);
      // The word JOIN should not be corrupted; the N' before the string should be removed
      expect(result).toContain("'JOIN IN ON'");
    });
  });

  describe('function conversions', () => {
    it('should convert GETUTCDATE() to NOW()', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([CreatedAt]) VALUES (GETUTCDATE())";
      const result = convert(sql);
      expect(result).toContain('NOW()');
      expect(result).not.toMatch(/GETUTCDATE/i);
    });

    it('should convert NEWID() to gen_random_uuid()', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([ID]) VALUES (NEWID())";
      const result = convert(sql);
      expect(result).toContain('gen_random_uuid()');
      expect(result).not.toMatch(/NEWID/i);
    });

    it('should convert NEWSEQUENTIALID() to gen_random_uuid()', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([ID]) VALUES (NEWSEQUENTIALID())";
      const result = convert(sql);
      expect(result).toContain('gen_random_uuid()');
      expect(result).not.toMatch(/NEWSEQUENTIALID/i);
    });

    it('should convert GETDATE() to NOW()', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([ModifiedAt]) VALUES (GETDATE())";
      const result = convert(sql);
      expect(result).toContain('NOW()');
      expect(result).not.toMatch(/GETDATE/i);
    });
  });

  describe('CAST type conversions', () => {
    it('should convert CAST(x AS UNIQUEIDENTIFIER) to CAST(x AS UUID)', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([ID]) VALUES (CAST('abc' AS UNIQUEIDENTIFIER))";
      const result = convert(sql);
      expect(result).toContain('AS UUID');
      expect(result).not.toMatch(/UNIQUEIDENTIFIER/i);
    });

    it('should convert CAST AS NVARCHAR(MAX) to CAST AS TEXT', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Data]) VALUES (CAST([Col] AS NVARCHAR(MAX)))";
      const result = convert(sql);
      expect(result).toContain('AS TEXT');
    });

    it('should convert CAST AS BIT to CAST AS BOOLEAN', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Flag]) VALUES (CAST(1 AS BIT))";
      const result = convert(sql);
      expect(result).toContain('AS BOOLEAN');
      expect(result).not.toMatch(/\bAS BIT\b/i);
    });
  });

  describe('COLLATE removal', () => {
    it('should remove COLLATE clauses', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Name]) VALUES ('test' COLLATE SQL_Latin1_General_CP1_CI_AS)";
      const result = convert(sql);
      expect(result).not.toMatch(/COLLATE/i);
    });
  });

  describe('UPDATE statements', () => {
    it('should convert UPDATE statement functions and identifiers', () => {
      const sql = "UPDATE [__mj].[Users] SET [ModifiedAt] = GETUTCDATE(), [Name] = N'Bob' WHERE [ID] = NEWID()";
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('NOW()');
      expect(result).toContain("'Bob'");
      expect(result).toContain('gen_random_uuid()');
    });
  });

  describe('DELETE statements', () => {
    it('should convert DELETE statement identifiers', () => {
      const sql = "DELETE FROM [__mj].[Foo] WHERE [ID] = CAST('abc' AS UNIQUEIDENTIFIER)";
      const result = convert(sql);
      expect(result).toContain('__mj."Foo"');
      expect(result).toContain('AS UUID');
    });
  });

  describe('output formatting', () => {
    it('should ensure output ends with semicolon and newline', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Name]) VALUES ('test')";
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });

    it('should not double semicolons if already present', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([Name]) VALUES ('test');";
      const result = convert(sql);
      expect(result).not.toContain(';;');
      expect(result).toMatch(/;\n$/);
    });

    it('should preserve multi-line format', () => {
      const sql = `INSERT INTO [__mj].[Foo]
  ([Name], [Value])
VALUES
  (N'Hello', GETUTCDATE())`;
      const result = convert(sql);
      expect(result).toContain('\n');
      expect(result).toContain("'Hello'");
      expect(result).toContain('NOW()');
    });
  });

  describe('multiple values', () => {
    it('should convert multiple values in one INSERT', () => {
      const sql = "INSERT INTO [__mj].[Foo] ([ID], [Name], [CreatedAt]) VALUES (NEWID(), N'Alice', GETUTCDATE())";
      const result = convert(sql);
      expect(result).toContain('gen_random_uuid()');
      expect(result).toContain("'Alice'");
      expect(result).toContain('NOW()');
    });
  });

  describe('UPDATE alias FROM pattern conversion', () => {
    it('should convert T-SQL UPDATE alias FROM table alias JOIN to PG syntax', () => {
      const sql = `UPDATE er
SET
\ter.DisplayName = NULL
FROM
\t[__mj].[EntityRelationship] er
INNER JOIN [__mj].[Entity] e1 ON er.EntityID = e1.ID
INNER JOIN [__mj].[Entity] e2 ON er.RelatedEntityID = e2.ID
WHERE
\te1.SchemaName = '__mj'
\tAND e2.SchemaName = '__mj'
\tAND er.DisplayName = e2.Name`;
      const result = convert(sql);
      // Should move table to UPDATE clause with AS alias
      expect(result).toContain('UPDATE __mj."EntityRelationship" AS er');
      // Should strip alias prefix from SET columns
      expect(result).toContain('"DisplayName" = NULL');
      expect(result).not.toMatch(/\ber\."DisplayName"\s*=\s*NULL/);
      // Should have comma-separated FROM (not JOINs)
      expect(result).toContain('__mj."Entity" e1');
      expect(result).toContain('__mj."Entity" e2');
      // JOIN conditions should be in WHERE
      expect(result).toContain('er."EntityID" = e1."ID"');
      expect(result).toContain('er."RelatedEntityID" = e2."ID"');
      // Original WHERE conditions preserved
      expect(result).toContain("e1.\"SchemaName\" = '__mj'");
      expect(result).not.toMatch(/\bINNER\s+JOIN\b/i);
    });

    it('should not modify UPDATE with direct table reference (no alias pattern)', () => {
      const sql = `UPDATE [__mj].[Users] SET [Name] = 'Bob' WHERE [ID] = '123'`;
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('"Name"');
      expect(result).not.toContain(' AS ');
    });

    it('should handle UPDATE alias FROM without JOINs', () => {
      const sql = `UPDATE e
SET e.Name = 'test'
FROM [__mj].[Entity] e
WHERE e.ID = '123'`;
      const result = convert(sql);
      expect(result).toContain('UPDATE __mj."Entity" AS e');
      expect(result).toContain('"Name" = ');
      // FROM should be removed (target is in UPDATE), WHERE preserved
      expect(result).toContain('WHERE');
      expect(result).not.toMatch(/\bFROM\b/i);
    });
  });

  describe('__mj_ prefixed column quoting', () => {
    it('should quote __mj_UpdatedAt in UPDATE SET clause', () => {
      const sql = `UPDATE __mj."Entity" SET "Icon" = 'test', __mj_UpdatedAt = NOW() WHERE "ID" = '123'`;
      const result = convert(sql);
      expect(result).toContain('"__mj_UpdatedAt"');
      expect(result).not.toMatch(/(?<!")__mj_UpdatedAt/);
    });

    it('should quote __mj_CreatedAt in INSERT column list', () => {
      const sql = `INSERT INTO __mj."Foo" ("ID", __mj_CreatedAt) VALUES ('1', NOW())`;
      const result = convert(sql);
      expect(result).toContain('"__mj_CreatedAt"');
    });

    it('should not double-quote already-quoted __mj_ columns', () => {
      const sql = `UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW()`;
      const result = convert(sql);
      expect(result).toContain('"__mj_UpdatedAt"');
      expect(result).not.toContain('""__mj_UpdatedAt""');
    });
  });
});
