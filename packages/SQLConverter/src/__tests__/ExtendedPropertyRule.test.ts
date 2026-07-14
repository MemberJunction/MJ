import { describe, it, expect } from 'vitest';
import { ExtendedPropertyRule } from '../rules/ExtendedPropertyRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new ExtendedPropertyRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('ExtendedPropertyRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('ExtendedPropertyRule');
      expect(rule.Priority).toBe(90);
      expect(rule.AppliesTo).toEqual(['EXTENDED_PROPERTY']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('table-level property', () => {
    it('should convert to COMMENT ON TABLE', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stores user records',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'Users'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON TABLE __mj.\"Users\" IS 'Stores user records';");
    });
  });

  describe('column-level property', () => {
    it('should convert to COMMENT ON COLUMN', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'Users',
        @level2type=N'COLUMN', @level2name=N'ID'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON COLUMN __mj.\"Users\".\"ID\" IS 'Primary key';");
    });
  });

  describe('view-level property', () => {
    it('should convert to COMMENT ON VIEW', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active users view',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'VIEW', @level1name=N'vwActiveUsers'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON VIEW __mj.\"vwActiveUsers\" IS 'Active users view';");
    });
  });

  describe('single quotes in value', () => {
    it('should preserve the full value when it contains escaped single quotes (named params)', () => {
      // Mirrors the real v5.48.x compaction migration description that a lazy value
      // regex truncated at the first '' pair (fixed by making the group greedy).
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Null inherits the agent type''s value (which, if also null, falls back to the selected model''s MaxInputTokens)',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'AIAgent',
        @level2type=N'COLUMN', @level2name=N'ContextWindowMaxTokens'`;
      const result = convert(sql);
      expect(result).toContain(
        "COMMENT ON COLUMN __mj.\"AIAgent\".\"ContextWindowMaxTokens\" IS 'Null inherits the agent type''s value (which, if also null, falls back to the selected model''s MaxInputTokens)';"
      );
    });

    it('should preserve the full value when it contains escaped single quotes (positional params)', () => {
      const sql = `EXEC sp_addextendedproperty N'MS_Description', N'The user''s preferred display name', 'SCHEMA', N'__mj', 'TABLE', N'Users', 'COLUMN', N'DisplayName'`;
      const result = convert(sql);
      expect(result).toContain(
        "COMMENT ON COLUMN __mj.\"Users\".\"DisplayName\" IS 'The user''s preferred display name';"
      );
    });

    it('should still terminate the value at the true closing quote when other literals follow', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Plain description',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'Users'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON TABLE __mj.\"Users\" IS 'Plain description';");
    });
  });

  describe('N-prefix handling', () => {
    it('should handle values with N prefix strings', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tracks changes',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'AuditLog'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON TABLE __mj.\"AuditLog\" IS 'Tracks changes';");
      expect(result).not.toContain("N'");
    });
  });

  describe('unparseable input fallback', () => {
    it('should produce a fallback comment if the property cannot be parsed', () => {
      const sql = "EXEC sp_addextendedproperty @name=N'MS_Description'";
      const result = convert(sql);
      expect(result).toContain('Extended property (could not parse)');
    });
  });

  describe('level1type fallback', () => {
    it('should skip COMMENT ON FUNCTION for PROCEDURE level1type', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Some description',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'PROCEDURE', @level1name=N'spDoSomething'`;
      const result = convert(sql);
      // PROCEDURE type generates a commented-out line (PG COMMENT ON FUNCTION needs signature)
      expect(result).toContain('-- COMMENT ON FUNCTION __mj."spDoSomething"');
      expect(result).toContain('procedure-level comment skipped');
    });
  });

  describe('value without N prefix', () => {
    it('should handle @value without N prefix', () => {
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value='Simple desc',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'Foo'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON TABLE __mj.\"Foo\" IS 'Simple desc';");
    });
  });
});
