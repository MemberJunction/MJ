import { describe, it, expect } from 'vitest';
import { ConditionalDDLRule } from '../rules/ConditionalDDLRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new ConditionalDDLRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('ConditionalDDLRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('ConditionalDDLRule');
      expect(rule.Priority).toBe(55);
      expect(rule.AppliesTo).toEqual(['CONDITIONAL_DDL']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('DO $$ block conversion', () => {
    it('should convert IF NOT EXISTS with ALTER TABLE ADD COLUMN to a DO $$ block', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'Entity' AND COLUMN_NAME = 'AllowMultipleSubtypes')
BEGIN
    ALTER TABLE [__mj].[Entity] ADD [AllowMultipleSubtypes] BIT NOT NULL DEFAULT 0;
END`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain('BEGIN');
      expect(result).toContain('IF NOT EXISTS (');
      expect(result).toContain(') THEN');
      expect(result).toContain('END IF;');
      expect(result).toContain('END $$;');
    });

    it('should convert IF NOT EXISTS INSERT INTO to a DO $$ block', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.EntityRelationship WHERE ID = '12345')
BEGIN
    INSERT INTO __mj.EntityRelationship (ID, EntityID, RelatedEntityID) VALUES ('12345', 'AAA', 'BBB');
END`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain('IF NOT EXISTS (');
      expect(result).toContain(') THEN');
      expect(result).toContain('INSERT INTO');
      expect(result).toContain('END IF;');
      expect(result).toContain('END $$;');
    });

    it('should indent condition and body lines within the DO block', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.Foo WHERE ID = '123')
BEGIN
    INSERT INTO __mj.Foo (ID, Name) VALUES ('123', 'Test');
END`;
      const result = convert(sql);
      // The condition and body should be indented
      expect(result).toContain('    IF NOT EXISTS (');
      expect(result).toContain('    ) THEN');
      expect(result).toContain('    END IF;');
    });
  });

  describe('conditional index conversion', () => {
    it('should convert IF NOT EXISTS sys.indexes CREATE INDEX to CREATE INDEX IF NOT EXISTS', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Email' AND object_id = OBJECT_ID('__mj.Users'))
CREATE INDEX [IX_Users_Email] ON __mj."Users" ("Email")`;
      const result = convert(sql);
      expect(result).toContain('CREATE INDEX IF NOT EXISTS');
      expect(result).toContain('"IX_Users_Email"');
      expect(result).not.toContain('IF NOT EXISTS (SELECT');
      expect(result).not.toContain('sys.indexes');
    });

    it('should handle UNIQUE index in conditional creation', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Foo_Name')
CREATE UNIQUE INDEX [UX_Foo_Name] ON __mj."Foo" ("Name")`;
      const result = convert(sql);
      expect(result).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
      expect(result).toContain('"UX_Foo_Name"');
    });

    it('should preserve WHERE clause on filtered index', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_SchemaInfo_Prefix' AND object_id = OBJECT_ID('__mj.SchemaInfo'))
BEGIN
    CREATE UNIQUE INDEX UQ_SchemaInfo_Prefix
    ON [__mj].SchemaInfo (
        EntityNamePrefix,
        EntityNameSuffix
    )
    WHERE EntityNamePrefix IS NOT NULL;
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
      expect(result).toContain('"UQ_SchemaInfo_Prefix"');
      expect(result).toContain('WHERE "EntityNamePrefix" IS NOT NULL');
      expect(result).toContain('"EntityNamePrefix"');
      expect(result).toContain('"EntityNameSuffix"');
      expect(result).not.toContain('WHERE E;');
      expect(result).not.toContain('sys.indexes');
    });

    it('should strip NONCLUSTERED keyword from conditional index', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bar_Col')
CREATE NONCLUSTERED INDEX [IX_Bar_Col] ON __mj."Bar" ("Col")`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).toContain('CREATE INDEX IF NOT EXISTS');
    });
  });

  describe('type conversions', () => {
    it('should convert NVARCHAR(MAX) to TEXT', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Data')
BEGIN
    ALTER TABLE __mj.Foo ADD Data NVARCHAR(MAX);
END`;
      const result = convert(sql);
      expect(result).toContain('TEXT');
      expect(result).not.toMatch(/NVARCHAR\s*\(\s*MAX\s*\)/i);
    });

    it('should convert NVARCHAR(100) to VARCHAR(100)', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Name')
BEGIN
    ALTER TABLE __mj.Foo ADD Name NVARCHAR(100);
END`;
      const result = convert(sql);
      expect(result).toContain('VARCHAR(100)');
      expect(result).not.toMatch(/NVARCHAR/i);
    });

    it('should convert BIT to BOOLEAN', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'IsActive')
BEGIN
    ALTER TABLE __mj.Foo ADD IsActive BIT NOT NULL DEFAULT 0;
END`;
      const result = convert(sql);
      expect(result).toContain('BOOLEAN');
      expect(result).not.toMatch(/(?<!")BIT\b/i);
    });

    it('should convert UNIQUEIDENTIFIER to UUID', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'RefID')
BEGIN
    ALTER TABLE __mj.Foo ADD RefID UNIQUEIDENTIFIER;
END`;
      const result = convert(sql);
      expect(result).toContain('UUID');
      expect(result).not.toMatch(/UNIQUEIDENTIFIER/i);
    });

    it('should convert DATETIMEOFFSET to TIMESTAMPTZ', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'UpdatedAt')
BEGIN
    ALTER TABLE __mj.Foo ADD UpdatedAt DATETIMEOFFSET(7);
END`;
      const result = convert(sql);
      expect(result).toContain('TIMESTAMPTZ');
      expect(result).not.toMatch(/DATETIMEOFFSET/i);
    });

    it('should convert TINYINT to SMALLINT', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Priority')
BEGIN
    ALTER TABLE __mj.Foo ADD Priority TINYINT;
END`;
      const result = convert(sql);
      expect(result).toContain('SMALLINT');
      expect(result).not.toMatch(/\bTINYINT\b/i);
    });

    it('should convert IMAGE to BYTEA', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Photo')
BEGIN
    ALTER TABLE __mj.Foo ADD Photo IMAGE;
END`;
      const result = convert(sql);
      expect(result).toContain('BYTEA');
      expect(result).not.toMatch(/\bIMAGE\b/i);
    });
  });

  describe('INFORMATION_SCHEMA casing', () => {
    it('should lowercase INFORMATION_SCHEMA to information_schema with bracket syntax', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM [INFORMATION_SCHEMA].[COLUMNS] WHERE [TABLE_NAME] = 'Foo' AND [COLUMN_NAME] = 'Bar')
BEGIN
    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);
END`;
      const result = convert(sql);
      expect(result).toContain('information_schema.columns');
      expect(result).not.toMatch(/INFORMATION_SCHEMA/);
    });

    it('should lowercase INFORMATION_SCHEMA column references with bracket syntax', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM [INFORMATION_SCHEMA].[COLUMNS] WHERE [TABLE_SCHEMA] = '__mj' AND [TABLE_NAME] = 'Users' AND [COLUMN_NAME] = 'Email')
BEGIN
    ALTER TABLE __mj.Users ADD Email VARCHAR(200);
END`;
      const result = convert(sql);
      expect(result).toContain('table_schema');
      expect(result).toContain('table_name');
      expect(result).toContain('column_name');
    });
  });

  describe('identifier conversion', () => {
    it('should convert bracket identifiers to quoted identifiers', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Entity' AND COLUMN_NAME = 'NewCol')
BEGIN
    ALTER TABLE [__mj].[Entity] ADD [NewCol] [nvarchar](100);
END`;
      const result = convert(sql);
      expect(result).toContain('__mj."Entity"');
      expect(result).not.toContain('[__mj]');
      expect(result).not.toContain('[Entity]');
    });
  });

  describe('N-prefix removal', () => {
    it('should remove N prefix from string literals', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.Foo WHERE Name = N'Test')
BEGIN
    INSERT INTO __mj.Foo (Name) VALUES (N'Test');
END`;
      const result = convert(sql);
      expect(result).not.toMatch(/(?<![a-zA-Z])N'/);
    });
  });

  describe('COLLATE removal', () => {
    it('should remove COLLATE clauses', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' COLLATE SQL_Latin1_General_CP1_CI_AS AND COLUMN_NAME = 'Bar')
BEGIN
    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);
END`;
      const result = convert(sql);
      expect(result).not.toMatch(/COLLATE/i);
    });
  });

  describe('PascalCase quoting', () => {
    it('should quote PascalCase identifiers in condition', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Entity' AND column_name = 'AllowMultipleSubtypes')
BEGIN
    ALTER TABLE __mj.Entity ADD AllowMultipleSubtypes BOOLEAN NOT NULL DEFAULT FALSE;
END`;
      const result = convert(sql);
      // PascalCase identifiers should be quoted
      expect(result).toContain('"AllowMultipleSubtypes"');
      expect(result).toContain('"Entity"');
    });

    it('should NOT quote SQL keywords', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Foo')
BEGIN
    ALTER TABLE __mj.Foo ADD MyColumn VARCHAR(50) NOT NULL DEFAULT '';
END`;
      const result = convert(sql);
      // SQL keywords should remain unquoted
      expect(result).not.toContain('"SELECT"');
      expect(result).not.toContain('"NOT"');
      expect(result).not.toContain('"NULL"');
      expect(result).not.toContain('"DEFAULT"');
      expect(result).not.toContain('"ALTER"');
      expect(result).not.toContain('"TABLE"');
    });

    it('should NOT corrupt UUID hex segments inside string literals', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.Foo WHERE ID = 'AF4C1234-5678-9ABC-DEF0-1234567890AB')
BEGIN
    INSERT INTO __mj.Foo (ID) VALUES ('AF4C1234-5678-9ABC-DEF0-1234567890AB');
END`;
      const result = convert(sql);
      // UUIDs inside strings should NOT be quoted
      expect(result).toContain("'AF4C1234-5678-9ABC-DEF0-1234567890AB'");
      expect(result).not.toContain('"AF4C1234"');
    });
  });

  describe('CREATE ROLE conversion', () => {
    it('should convert bare CREATE ROLE to DO block with pg_roles check', () => {
      const sql = 'CREATE ROLE MyRole';
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'MyRole'");
      expect(result).toContain('CREATE ROLE MyRole;');
    });

    it('should handle quoted role names from convertIdentifiers', () => {
      const sql = 'CREATE ROLE "InventoryReader"';
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'InventoryReader'");
      expect(result).toContain('CREATE ROLE "InventoryReader";');
    });

    it('should handle IF NOT EXISTS wrapper around CREATE ROLE', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'MyRole')
    CREATE ROLE "MyRole"`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'MyRole'");
      expect(result).toContain('CREATE ROLE "MyRole";');
    });
  });

  describe('fallback behavior', () => {
    it('should comment out unparseable conditional DDL', () => {
      // No BEGIN...END block — should fall back to commenting out
      const sql = `IF SOME_RANDOM_CONDITION = 1
SET @var = 'value'`;
      const result = convert(sql);
      expect(result).toContain('-- TODO: Review conditional DDL');
      expect(result).toContain('--');
    });
  });

  describe('output formatting', () => {
    it('should end with newline', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Bar')
BEGIN
    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);
END`;
      const result = convert(sql);
      expect(result).toMatch(/\n$/);
    });
  });
});
