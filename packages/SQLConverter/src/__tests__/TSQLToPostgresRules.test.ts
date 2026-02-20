import { describe, it, expect } from 'vitest';
import { getTSQLToPostgresRules } from '../rules/TSQLToPostgresRules.js';
import { CreateTableRule } from '../rules/CreateTableRule.js';
import { ViewRule } from '../rules/ViewRule.js';
import { ProcedureToFunctionRule } from '../rules/ProcedureToFunctionRule.js';
import { FunctionRule } from '../rules/FunctionRule.js';
import { TriggerRule } from '../rules/TriggerRule.js';
import { InsertRule } from '../rules/InsertRule.js';
import { ConditionalDDLRule } from '../rules/ConditionalDDLRule.js';
import { AlterTableRule } from '../rules/AlterTableRule.js';
import { CreateIndexRule } from '../rules/CreateIndexRule.js';
import { GrantRule } from '../rules/GrantRule.js';
import { ExtendedPropertyRule } from '../rules/ExtendedPropertyRule.js';

describe('getTSQLToPostgresRules', () => {
  const rules = getTSQLToPostgresRules();

  describe('rule count', () => {
    it('should return exactly 11 rules', () => {
      expect(rules).toHaveLength(11);
    });
  });

  describe('priority ordering', () => {
    it('should return rules sorted by priority ascending', () => {
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i].Priority).toBeGreaterThanOrEqual(rules[i - 1].Priority);
      }
    });

    it('should have specific priority values', () => {
      const priorities = rules.map(r => r.Priority);
      expect(priorities).toEqual([10, 20, 30, 35, 40, 50, 55, 60, 70, 80, 90]);
    });
  });

  describe('unique names', () => {
    it('should have a unique name for each rule', () => {
      const names = rules.map(r => r.Name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('rule types', () => {
    it('should contain a CreateTableRule', () => {
      expect(rules.some(r => r instanceof CreateTableRule)).toBe(true);
    });

    it('should contain a ViewRule', () => {
      expect(rules.some(r => r instanceof ViewRule)).toBe(true);
    });

    it('should contain a ProcedureToFunctionRule', () => {
      expect(rules.some(r => r instanceof ProcedureToFunctionRule)).toBe(true);
    });

    it('should contain a FunctionRule', () => {
      expect(rules.some(r => r instanceof FunctionRule)).toBe(true);
    });

    it('should contain a TriggerRule', () => {
      expect(rules.some(r => r instanceof TriggerRule)).toBe(true);
    });

    it('should contain an InsertRule', () => {
      expect(rules.some(r => r instanceof InsertRule)).toBe(true);
    });

    it('should contain a ConditionalDDLRule', () => {
      expect(rules.some(r => r instanceof ConditionalDDLRule)).toBe(true);
    });

    it('should contain an AlterTableRule', () => {
      expect(rules.some(r => r instanceof AlterTableRule)).toBe(true);
    });

    it('should contain a CreateIndexRule', () => {
      expect(rules.some(r => r instanceof CreateIndexRule)).toBe(true);
    });

    it('should contain a GrantRule', () => {
      expect(rules.some(r => r instanceof GrantRule)).toBe(true);
    });

    it('should contain an ExtendedPropertyRule', () => {
      expect(rules.some(r => r instanceof ExtendedPropertyRule)).toBe(true);
    });
  });

  describe('interface compliance', () => {
    it('should have all rules implement PostProcess', () => {
      for (const rule of rules) {
        expect(typeof rule.PostProcess).toBe('function');
      }
    });

    it('should have all rules set BypassSqlglot to true', () => {
      for (const rule of rules) {
        expect(rule.BypassSqlglot).toBe(true);
      }
    });

    it('should have all rules with non-empty AppliesTo arrays', () => {
      for (const rule of rules) {
        expect(rule.AppliesTo.length).toBeGreaterThan(0);
      }
    });

    it('should have all rules with non-empty Name strings', () => {
      for (const rule of rules) {
        expect(rule.Name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('statement type coverage', () => {
    it('should cover CREATE_TABLE', () => {
      expect(rules.some(r => r.AppliesTo.includes('CREATE_TABLE'))).toBe(true);
    });

    it('should cover CREATE_VIEW', () => {
      expect(rules.some(r => r.AppliesTo.includes('CREATE_VIEW'))).toBe(true);
    });

    it('should cover CREATE_PROCEDURE', () => {
      expect(rules.some(r => r.AppliesTo.includes('CREATE_PROCEDURE'))).toBe(true);
    });

    it('should cover CREATE_FUNCTION', () => {
      expect(rules.some(r => r.AppliesTo.includes('CREATE_FUNCTION'))).toBe(true);
    });

    it('should cover CREATE_TRIGGER', () => {
      expect(rules.some(r => r.AppliesTo.includes('CREATE_TRIGGER'))).toBe(true);
    });

    it('should cover INSERT, UPDATE, DELETE', () => {
      expect(rules.some(r => r.AppliesTo.includes('INSERT'))).toBe(true);
      expect(rules.some(r => r.AppliesTo.includes('UPDATE'))).toBe(true);
      expect(rules.some(r => r.AppliesTo.includes('DELETE'))).toBe(true);
    });

    it('should cover CONDITIONAL_DDL', () => {
      expect(rules.some(r => r.AppliesTo.includes('CONDITIONAL_DDL'))).toBe(true);
    });

    it('should cover FK_CONSTRAINT', () => {
      expect(rules.some(r => r.AppliesTo.includes('FK_CONSTRAINT'))).toBe(true);
    });

    it('should cover CREATE_INDEX', () => {
      expect(rules.some(r => r.AppliesTo.includes('CREATE_INDEX'))).toBe(true);
    });

    it('should cover GRANT and REVOKE', () => {
      expect(rules.some(r => r.AppliesTo.includes('GRANT'))).toBe(true);
      expect(rules.some(r => r.AppliesTo.includes('REVOKE'))).toBe(true);
    });

    it('should cover EXTENDED_PROPERTY', () => {
      expect(rules.some(r => r.AppliesTo.includes('EXTENDED_PROPERTY'))).toBe(true);
    });
  });
});
