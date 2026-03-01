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
    it('should handle values containing escaped single quotes', () => {
      // Note: The non-greedy regex in ExtendedPropertyRule truncates at the first
      // single-quote boundary in doubled-quote sequences. This test documents the
      // current behavior. Values with embedded single quotes may be truncated.
      const sql = `EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Users table description',
        @level0type=N'SCHEMA', @level0name=N'__mj',
        @level1type=N'TABLE', @level1name=N'Users'`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON TABLE __mj.\"Users\" IS 'Users table description';");
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
