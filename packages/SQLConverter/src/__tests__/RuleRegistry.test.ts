import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../rules/RuleRegistry.js';
import type { IConversionRule, ConversionContext, StatementType } from '../rules/types.js';

/** Minimal stub rule for testing the registry */
function makeRule(
  name: string,
  source: string,
  target: string,
  priority: number,
): IConversionRule {
  return {
    Name: name,
    SourceDialect: source,
    TargetDialect: target,
    AppliesTo: ['CREATE_TABLE' as StatementType],
    Priority: priority,
    BypassSqlglot: true,
    PostProcess(sql: string, _orig: string, _ctx: ConversionContext) { return sql; },
  };
}

describe('RuleRegistry', () => {
  beforeEach(() => {
    RuleRegistry.Clear();
  });

  describe('Register / GetRules', () => {
    it('should store and retrieve a single rule', () => {
      const rule = makeRule('R1', 'tsql', 'postgres', 10);
      RuleRegistry.Register(rule);
      const rules = RuleRegistry.GetRules('tsql', 'postgres');
      expect(rules).toHaveLength(1);
      expect(rules[0].Name).toBe('R1');
    });

    it('should return rules sorted by priority ascending', () => {
      RuleRegistry.Register(makeRule('Low', 'tsql', 'postgres', 90));
      RuleRegistry.Register(makeRule('High', 'tsql', 'postgres', 10));
      RuleRegistry.Register(makeRule('Mid', 'tsql', 'postgres', 50));

      const rules = RuleRegistry.GetRules('tsql', 'postgres');
      expect(rules.map(r => r.Name)).toEqual(['High', 'Mid', 'Low']);
    });

    it('should return an empty array for unregistered dialect combination', () => {
      expect(RuleRegistry.GetRules('mysql', 'postgres')).toEqual([]);
    });

    it('should not mutate the internal store when the returned array is modified', () => {
      RuleRegistry.Register(makeRule('R1', 'tsql', 'postgres', 10));
      const rules = RuleRegistry.GetRules('tsql', 'postgres');
      rules.push(makeRule('R2', 'tsql', 'postgres', 20));
      // The internal store should still have only 1 rule
      expect(RuleRegistry.GetRules('tsql', 'postgres')).toHaveLength(1);
    });
  });

  describe('RegisterAll', () => {
    it('should register multiple rules at once', () => {
      RuleRegistry.RegisterAll([
        makeRule('R1', 'tsql', 'postgres', 10),
        makeRule('R2', 'tsql', 'postgres', 20),
        makeRule('R3', 'tsql', 'mysql', 30),
      ]);

      expect(RuleRegistry.GetRules('tsql', 'postgres')).toHaveLength(2);
      expect(RuleRegistry.GetRules('tsql', 'mysql')).toHaveLength(1);
    });
  });

  describe('HasRules', () => {
    it('should return true when rules exist', () => {
      RuleRegistry.Register(makeRule('R1', 'tsql', 'postgres', 10));
      expect(RuleRegistry.HasRules('tsql', 'postgres')).toBe(true);
    });

    it('should return false when no rules exist', () => {
      expect(RuleRegistry.HasRules('tsql', 'mysql')).toBe(false);
    });
  });

  describe('GetRegisteredCombinations', () => {
    it('should return all registered dialect combinations', () => {
      RuleRegistry.RegisterAll([
        makeRule('R1', 'tsql', 'postgres', 10),
        makeRule('R2', 'tsql', 'mysql', 20),
        makeRule('R3', 'mysql', 'postgres', 30),
      ]);

      const combos = RuleRegistry.GetRegisteredCombinations();
      expect(combos).toHaveLength(3);
      expect(combos).toEqual(expect.arrayContaining([
        { Source: 'tsql', Target: 'postgres' },
        { Source: 'tsql', Target: 'mysql' },
        { Source: 'mysql', Target: 'postgres' },
      ]));
    });

    it('should return empty array when nothing is registered', () => {
      expect(RuleRegistry.GetRegisteredCombinations()).toEqual([]);
    });
  });

  describe('case insensitivity', () => {
    it('should treat dialect names as case-insensitive', () => {
      RuleRegistry.Register(makeRule('R1', 'TSQL', 'POSTGRES', 10));
      expect(RuleRegistry.HasRules('tsql', 'postgres')).toBe(true);
      expect(RuleRegistry.GetRules('TSQL', 'POSTGRES')).toHaveLength(1);
      expect(RuleRegistry.GetRules('tsql', 'postgres')).toHaveLength(1);
    });
  });

  describe('Clear', () => {
    it('should remove all registered rules', () => {
      RuleRegistry.Register(makeRule('R1', 'tsql', 'postgres', 10));
      RuleRegistry.Register(makeRule('R2', 'tsql', 'mysql', 20));
      RuleRegistry.Clear();
      expect(RuleRegistry.GetRegisteredCombinations()).toEqual([]);
      expect(RuleRegistry.HasRules('tsql', 'postgres')).toBe(false);
    });
  });
});
