import { describe, it, expect } from 'vitest';
import { GrantRule } from '../rules/GrantRule.js';
import { createConversionContext } from '../rules/types.js';
import type { ConversionContext } from '../rules/types.js';

const rule = new GrantRule();

function convert(sql: string, context?: ConversionContext): string {
  const ctx = context ?? createConversionContext('tsql', 'postgres');
  return rule.PostProcess!(sql, sql, ctx);
}

function contextWithFunctions(...names: string[]): ConversionContext {
  const ctx = createConversionContext('tsql', 'postgres');
  for (const name of names) {
    ctx.CreatedFunctions.add(name);
  }
  return ctx;
}

function contextWithViews(...names: string[]): ConversionContext {
  const ctx = createConversionContext('tsql', 'postgres');
  for (const name of names) {
    ctx.CreatedViews.add(name);
  }
  return ctx;
}

describe('GrantRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('GrantRule');
      expect(rule.Priority).toBe(80);
      expect(rule.AppliesTo).toEqual(['GRANT', 'REVOKE']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('GRANT SELECT on table', () => {
    it('should convert bracket identifiers in a GRANT SELECT', () => {
      const sql = 'GRANT SELECT ON [__mj].[Users] TO [cdp_Developer]';
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('"cdp_Developer"');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });

    it('should ensure semicolon at end', () => {
      const sql = 'GRANT SELECT ON [__mj].[Users] TO [cdp_Developer]';
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });

    it('should not double semicolons', () => {
      const sql = 'GRANT SELECT ON [__mj].[Users] TO [cdp_Developer];';
      const result = convert(sql);
      expect(result).not.toContain(';;');
    });
  });

  describe('GRANT EXECUTE on function', () => {
    it('should add FUNCTION keyword for GRANT EXECUTE', () => {
      const ctx = contextWithFunctions('spMyProc');
      const sql = 'GRANT EXECUTE ON [__mj].[spMyProc] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).toContain('GRANT EXECUTE ON FUNCTION');
    });

    it('should not duplicate FUNCTION keyword if already present', () => {
      const ctx = contextWithFunctions('spMyProc');
      const sql = 'GRANT EXECUTE ON FUNCTION [__mj].[spMyProc] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      // Should not have "FUNCTION FUNCTION"
      expect(result).not.toContain('FUNCTION FUNCTION');
      expect(result).toContain('GRANT EXECUTE ON FUNCTION');
    });

    it('should skip EXECUTE grant on function not in CreatedFunctions', () => {
      const ctx = createConversionContext('tsql', 'postgres');
      // Don't add spMissingProc to CreatedFunctions
      const sql = 'GRANT EXECUTE ON [__mj].[spMissingProc] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).toContain('-- SKIPPED (function not created)');
      expect(result).not.toContain('GRANT EXECUTE ON FUNCTION');
    });

    it('should convert EXECUTE grant when function IS in CreatedFunctions', () => {
      const ctx = contextWithFunctions('spCreateUser');
      const sql = 'GRANT EXECUTE ON [__mj].[spCreateUser] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).not.toContain('-- SKIPPED');
      expect(result).toContain('GRANT EXECUTE ON FUNCTION');
    });
  });

  describe('REVOKE EXECUTE on function', () => {
    it('should add FUNCTION keyword for REVOKE EXECUTE', () => {
      const ctx = contextWithFunctions('spMyProc');
      const sql = 'REVOKE EXECUTE ON [__mj].[spMyProc] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).toContain('REVOKE EXECUTE ON FUNCTION');
    });
  });

  describe('GRANT on views', () => {
    it('should skip GRANT on view not in CreatedViews', () => {
      const ctx = createConversionContext('tsql', 'postgres');
      const sql = 'GRANT SELECT ON [__mj].[vwActiveUsers] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).toContain('-- SKIPPED (view not created)');
    });

    it('should allow GRANT on view that IS in CreatedViews', () => {
      const ctx = contextWithViews('vwActiveUsers');
      const sql = 'GRANT SELECT ON [__mj].[vwActiveUsers] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).not.toContain('-- SKIPPED');
      expect(result).toContain('GRANT SELECT');
    });

    it('should not skip GRANT on non-view table even without CreatedViews', () => {
      const ctx = createConversionContext('tsql', 'postgres');
      // "Users" doesn't start with "vw" so it shouldn't be checked against CreatedViews
      const sql = 'GRANT SELECT ON [__mj].[Users] TO [cdp_Developer]';
      const result = convert(sql, ctx);
      expect(result).not.toContain('-- SKIPPED');
      expect(result).toContain('GRANT SELECT');
    });
  });

  describe('N-prefix removal', () => {
    it('should remove N prefix from string literals in GRANT statements', () => {
      const sql = "GRANT SELECT ON [__mj].[Users] TO [cdp_Developer] -- N'Comment'";
      const result = convert(sql);
      expect(result).not.toMatch(/(?<![a-zA-Z])N'/);
    });
  });

  describe('GRANT with multiple permissions', () => {
    it('should handle GRANT INSERT on table', () => {
      const sql = 'GRANT INSERT ON [__mj].[Users] TO [cdp_Developer]';
      const result = convert(sql);
      expect(result).toContain('GRANT INSERT');
      expect(result).toContain('__mj."Users"');
    });

    it('should handle GRANT UPDATE on table', () => {
      const sql = 'GRANT UPDATE ON [__mj].[Users] TO [cdp_Developer]';
      const result = convert(sql);
      expect(result).toContain('GRANT UPDATE');
    });

    it('should handle GRANT DELETE on table', () => {
      const sql = 'GRANT DELETE ON [__mj].[Users] TO [cdp_Developer]';
      const result = convert(sql);
      expect(result).toContain('GRANT DELETE');
    });
  });

  describe('output formatting', () => {
    it('should end with semicolon and newline', () => {
      const sql = 'GRANT SELECT ON [__mj].[Foo] TO [cdp_Developer]';
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });

    it('should trim trailing whitespace before semicolon', () => {
      const sql = 'GRANT SELECT ON [__mj].[Foo] TO [cdp_Developer]   ';
      const result = convert(sql);
      // Should be trimmed, not have trailing spaces before semicolon
      expect(result).toMatch(/;\n$/);
      expect(result).not.toMatch(/\s+;\n$/);
    });
  });
});
