import { describe, it, expect } from 'vitest';
import { AlterTableRule } from '../rules/AlterTableRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new AlterTableRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('AlterTableRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('AlterTableRule');
      expect(rule.Priority).toBe(60);
      expect(rule.AppliesTo).toEqual([
        'FK_CONSTRAINT', 'PK_CONSTRAINT', 'CHECK_CONSTRAINT',
        'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT', 'ALTER_TABLE',
      ]);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('foreign key constraints', () => {
    it('should add DEFERRABLE INITIALLY DEFERRED to FK constraints', () => {
      const sql = `ALTER TABLE [__mj].[Orders] ADD CONSTRAINT [FK_Orders_Users]
        FOREIGN KEY ([UserID]) REFERENCES [__mj].[Users] ([ID])`;
      const result = convert(sql);
      expect(result).toContain('FOREIGN KEY');
      expect(result).toContain('DEFERRABLE INITIALLY DEFERRED');
    });

    it('should remove WITH NOCHECK from FK constraints', () => {
      const sql = `ALTER TABLE [__mj].[Orders] WITH NOCHECK ADD CONSTRAINT [FK_Orders_Users]
        FOREIGN KEY ([UserID]) REFERENCES [__mj].[Users] ([ID])`;
      const result = convert(sql);
      expect(result).not.toMatch(/WITH\s+NOCHECK/i);
      expect(result).toContain('DEFERRABLE INITIALLY DEFERRED');
    });
  });

  describe('primary key constraints', () => {
    it('should convert PK constraint identifiers', () => {
      const sql = `ALTER TABLE [__mj].[Users] ADD CONSTRAINT [PK_Users]
        PRIMARY KEY CLUSTERED ([ID])`;
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('"PK_Users"');
      expect(result).toContain('PRIMARY KEY');
      expect(result).not.toMatch(/\bCLUSTERED\b/i);
    });
  });

  describe('check constraints', () => {
    it('should convert CHECK constraint identifiers', () => {
      const sql = `ALTER TABLE [__mj].[Items] ADD CONSTRAINT [CK_Items_Status]
        CHECK ([Status] IN (N'Active', N'Inactive'))`;
      const result = convert(sql);
      expect(result).toContain('__mj."Items"');
      expect(result).toContain('CHECK');
      expect(result).toContain("'Active'");
      expect(result).toContain("'Inactive'");
      expect(result).not.toContain("N'");
    });
  });

  describe('unique constraints', () => {
    it('should convert UNIQUE constraint identifiers', () => {
      const sql = `ALTER TABLE [__mj].[Users] ADD CONSTRAINT [UQ_Users_Email]
        UNIQUE NONCLUSTERED ([Email])`;
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('UNIQUE');
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
    });
  });

  describe('ENABLE_CONSTRAINT (no-op)', () => {
    it('should convert enable constraint to a comment', () => {
      const sql = `ALTER TABLE [__mj].[Orders] WITH CHECK CHECK CONSTRAINT [FK_Orders_Users]`;
      const result = convert(sql);
      expect(result).toContain('Constraint enable (no-op in PostgreSQL)');
    });
  });

  describe('CLUSTERED / NONCLUSTERED removal', () => {
    it('should remove CLUSTERED keyword', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [PK_Foo] PRIMARY KEY CLUSTERED ([ID])`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bCLUSTERED\b/i);
      expect(result).toContain('PRIMARY KEY');
    });

    it('should remove NONCLUSTERED keyword', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [UQ_Foo] UNIQUE NONCLUSTERED ([Name])`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).toContain('UNIQUE');
    });
  });

  describe('identifier conversion', () => {
    it('should convert all bracket identifiers to double-quoted identifiers', () => {
      const sql = `ALTER TABLE [__mj].[OrderItems] ADD CONSTRAINT [FK_OrderItems_Orders]
        FOREIGN KEY ([OrderID]) REFERENCES [__mj].[Orders] ([ID])`;
      const result = convert(sql);
      expect(result).toContain('__mj."OrderItems"');
      expect(result).toContain('"FK_OrderItems_Orders"');
      expect(result).toContain('"OrderID"');
      expect(result).toContain('__mj."Orders"');
      expect(result).toContain('"ID"');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });
  });

  describe('COLLATE removal', () => {
    it('should remove COLLATE clauses from ALTER TABLE statements', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ALTER COLUMN [Name] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL`;
      const result = convert(sql);
      expect(result).not.toMatch(/COLLATE/i);
    });
  });

  describe('CHECK constraint string literal preservation', () => {
    it('should not quote PascalCase words inside string literals in CHECK constraints', () => {
      const sql = `ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_DisplayIconType]
        CHECK (([DisplayIconType]='None' OR [DisplayIconType]='Custom' OR [DisplayIconType]='Related Entity Icon'))`;
      const result = convert(sql);
      expect(result).toContain("'Related Entity Icon'");
      expect(result).not.toContain('"Entity"');
    });
  });

  describe('output formatting', () => {
    it('should ensure output ends with semicolon and newline', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [PK_Foo] PRIMARY KEY ([ID])`;
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });
  });
});
