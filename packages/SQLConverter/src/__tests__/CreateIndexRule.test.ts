import { describe, it, expect } from 'vitest';
import { CreateIndexRule } from '../rules/CreateIndexRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new CreateIndexRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('CreateIndexRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('CreateIndexRule');
      expect(rule.Priority).toBe(70);
      expect(rule.AppliesTo).toEqual(['CREATE_INDEX']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('basic index creation', () => {
    it('should convert a simple CREATE INDEX', () => {
      const sql = 'CREATE INDEX [IX_Users_Email] ON [__mj].[Users] ([Email])';
      const result = convert(sql);
      expect(result).toContain('CREATE INDEX');
      expect(result).toContain('"IX_Users_Email"');
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('"Email"');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });

    it('should handle multiple columns in index', () => {
      const sql = 'CREATE INDEX [IX_Foo_AB] ON [__mj].[Foo] ([ColA], [ColB])';
      const result = convert(sql);
      expect(result).toContain('"ColA"');
      expect(result).toContain('"ColB"');
    });
  });

  describe('UNIQUE index', () => {
    it('should preserve UNIQUE keyword', () => {
      const sql = 'CREATE UNIQUE INDEX [UX_Users_Email] ON [__mj].[Users] ([Email])';
      const result = convert(sql);
      expect(result).toContain('CREATE UNIQUE INDEX');
      expect(result).toContain('"UX_Users_Email"');
    });
  });

  describe('CLUSTERED/NONCLUSTERED removal', () => {
    it('should remove CLUSTERED keyword', () => {
      const sql = 'CREATE CLUSTERED INDEX [IX_Foo_ID] ON [__mj].[Foo] ([ID])';
      const result = convert(sql);
      expect(result).not.toMatch(/\bCLUSTERED\b/i);
      expect(result).toContain('CREATE');
      expect(result).toContain('INDEX');
    });

    it('should remove NONCLUSTERED keyword', () => {
      const sql = 'CREATE NONCLUSTERED INDEX [IX_Foo_Name] ON [__mj].[Foo] ([Name])';
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).toContain('CREATE');
      expect(result).toContain('INDEX');
    });

    it('should remove UNIQUE NONCLUSTERED combination', () => {
      const sql = 'CREATE UNIQUE NONCLUSTERED INDEX [UX_Foo_Code] ON [__mj].[Foo] ([Code])';
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).toContain('CREATE UNIQUE');
      expect(result).toContain('INDEX');
    });
  });

  describe('WITH option block removal', () => {
    it('should remove WITH (PAD_INDEX = OFF, ...) option blocks', () => {
      const sql = 'CREATE INDEX [IX_Foo_Col] ON [__mj].[Foo] ([Col]) WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF)';
      const result = convert(sql);
      expect(result).not.toContain('WITH');
      expect(result).not.toContain('PAD_INDEX');
      expect(result).not.toContain('STATISTICS_NORECOMPUTE');
    });

    it('should remove WITH (FILLFACTOR = 80) blocks', () => {
      const sql = 'CREATE INDEX [IX_Bar_Col] ON [__mj].[Bar] ([Col]) WITH (FILLFACTOR = 80)';
      const result = convert(sql);
      expect(result).not.toContain('WITH');
      expect(result).not.toContain('FILLFACTOR');
    });
  });

  describe('ON filegroup removal', () => {
    it('should remove ON [PRIMARY] filegroup reference', () => {
      const sql = 'CREATE INDEX [IX_Foo_Col] ON [__mj].[Foo] ([Col]) ON [PRIMARY]';
      const result = convert(sql);
      expect(result).not.toContain('PRIMARY');
    });
  });

  describe('INCLUDE column removal', () => {
    it('should remove INCLUDE (columns) clause', () => {
      const sql = 'CREATE INDEX [IX_Foo_Col] ON [__mj].[Foo] ([Col]) INCLUDE ([IncludedCol1], [IncludedCol2])';
      const result = convert(sql);
      expect(result).not.toContain('INCLUDE');
      expect(result).not.toContain('IncludedCol1');
      expect(result).not.toContain('IncludedCol2');
    });
  });

  describe('boolean value fixes', () => {
    it('should convert =(1) to =TRUE in WHERE clauses', () => {
      const sql = 'CREATE INDEX [IX_Foo_Active] ON [__mj].[Foo] ([Name]) WHERE [IsActive]=(1)';
      const result = convert(sql);
      expect(result).toContain('=TRUE');
      expect(result).not.toContain('=(1)');
    });

    it('should convert =(0) to =FALSE in WHERE clauses', () => {
      const sql = 'CREATE INDEX [IX_Foo_Inactive] ON [__mj].[Foo] ([Name]) WHERE [IsDeleted]=(0)';
      const result = convert(sql);
      expect(result).toContain('=FALSE');
      expect(result).not.toContain('=(0)');
    });
  });

  describe('filtered/partial indexes', () => {
    it('should preserve WHERE clause for partial indexes', () => {
      const sql = 'CREATE INDEX [IX_Foo_Active] ON [__mj].[Foo] ([Email]) WHERE [IsActive]=(1)';
      const result = convert(sql);
      expect(result).toContain('WHERE');
      expect(result).toContain('"IsActive"=TRUE');
    });
  });

  describe('output formatting', () => {
    it('should ensure output ends with semicolon and newline', () => {
      const sql = 'CREATE INDEX [IX_Foo_Col] ON [__mj].[Foo] ([Col])';
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });

    it('should not double semicolons if already present', () => {
      const sql = 'CREATE INDEX [IX_Foo_Col] ON [__mj].[Foo] ([Col]);';
      const result = convert(sql);
      expect(result).not.toContain(';;');
      expect(result).toMatch(/;\n$/);
    });
  });

  describe('combined options', () => {
    it('should handle index with NONCLUSTERED, WITH, INCLUDE, and ON together', () => {
      const sql = `CREATE NONCLUSTERED INDEX [IX_Complex] ON [__mj].[BigTable] ([ColA], [ColB])
INCLUDE ([ColC], [ColD])
WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF)
ON [PRIMARY]`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).not.toContain('INCLUDE');
      expect(result).not.toContain('PAD_INDEX');
      expect(result).not.toContain('PRIMARY');
      expect(result).toContain('"IX_Complex"');
      expect(result).toContain('__mj."BigTable"');
      expect(result).toContain('"ColA"');
      expect(result).toContain('"ColB"');
    });
  });
});
