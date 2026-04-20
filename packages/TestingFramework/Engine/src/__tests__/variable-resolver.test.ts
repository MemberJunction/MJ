/**
 * Unit tests for VariableResolver
 */

import { VariableResolver, VariableResolutionError } from '../utils/variable-resolver';
import {
  TestTypeVariablesSchema,
  TestVariablesConfig,
  TestSuiteVariablesConfig,
  TestRunOptions
} from '@memberjunction/testing-engine-base';

describe('VariableResolver', () => {
  let resolver: VariableResolver;

  beforeEach(() => {
    resolver = new VariableResolver();
  });

  // ============================================================================
  // Schema Parsing Tests
  // ============================================================================

  describe('parseTypeSchema', () => {
    it('should return null for null input', () => {
      const result = resolver.parseTypeSchema(null);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = resolver.parseTypeSchema('');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const result = resolver.parseTypeSchema('not valid json');
      expect(result).toBeNull();
    });

    it('should parse valid schema', () => {
      const schema: TestTypeVariablesSchema = {
        schemaVersion: '1.0',
        variables: [
          {
            name: 'TestVar',
            displayName: 'Test Variable',
            dataType: 'string',
            valueSource: 'freeform',
            required: false
          }
        ]
      };

      const result = resolver.parseTypeSchema(JSON.stringify(schema));
      expect(result).toEqual(schema);
    });

    it('should throw for unsupported schema version', () => {
      const schema = {
        schemaVersion: '2.0',
        variables: []
      };

      expect(() => resolver.parseTypeSchema(JSON.stringify(schema)))
        .toThrow(VariableResolutionError);
    });
  });

  describe('parseTestConfig', () => {
    it('should return null for null input', () => {
      const result = resolver.parseTestConfig(null);
      expect(result).toBeNull();
    });

    it('should parse valid config', () => {
      const config: TestVariablesConfig = {
        variables: {
          TestVar: { exposed: true, defaultValue: 'test' }
        }
      };

      const result = resolver.parseTestConfig(JSON.stringify(config));
      expect(result).toEqual(config);
    });
  });

  describe('parseSuiteConfig', () => {
    it('should return null for null input', () => {
      const result = resolver.parseSuiteConfig(null);
      expect(result).toBeNull();
    });

    it('should parse valid config', () => {
      const config: TestSuiteVariablesConfig = {
        variables: {
          TestVar: 'suite-value'
        }
      };

      const result = resolver.parseSuiteConfig(JSON.stringify(config));
      expect(result).toEqual(config);
    });
  });

  // ============================================================================
  // Variable Resolution Tests
  // ============================================================================

  describe('resolveVariables', () => {
    const baseTypeSchema: TestTypeVariablesSchema = {
      schemaVersion: '1.0',
      variables: [
        {
          name: 'AIConfiguration',
          displayName: 'AI Configuration',
          dataType: 'string',
          valueSource: 'static',
          possibleValues: [
            { value: 'claude', label: 'Claude' },
            { value: 'gpt4', label: 'GPT-4' },
            { value: 'gemini', label: 'Gemini' }
          ],
          defaultValue: 'claude',
          required: false
        },
        {
          name: 'Temperature',
          displayName: 'Temperature',
          dataType: 'number',
          valueSource: 'freeform',
          defaultValue: 0.7,
          required: false
        },
        {
          name: 'RequiredVar',
          displayName: 'Required Variable',
          dataType: 'string',
          valueSource: 'freeform',
          required: true
        }
      ]
    };

    it('should return empty result for null type schema', () => {
      const result = resolver.resolveVariables(null, null, null, {});
      expect(result).toEqual({ values: {}, sources: {} });
    });

    it('should return empty result for empty variables array', () => {
      const schema: TestTypeVariablesSchema = {
        schemaVersion: '1.0',
        variables: []
      };
      const result = resolver.resolveVariables(JSON.stringify(schema), null, null, {});
      expect(result).toEqual({ values: {}, sources: {} });
    });

    it('should use type defaults when no overrides provided', () => {
      const result = resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        null,
        null,
        { variables: { RequiredVar: 'required-value' } }
      );

      expect(result.values['AIConfiguration']).toBe('claude');
      expect(result.sources['AIConfiguration']).toBe('type');
      expect(result.values['Temperature']).toBe(0.7);
      expect(result.sources['Temperature']).toBe('type');
    });

    it('should throw for missing required variable', () => {
      expect(() => resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        null,
        null,
        {}
      )).toThrow(VariableResolutionError);
    });

    it('should use run-level values over all others', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          AIConfiguration: { exposed: true, defaultValue: 'test-default' }
        }
      };

      const suiteConfig: TestSuiteVariablesConfig = {
        variables: { AIConfiguration: 'gpt4' }
      };

      const result = resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        JSON.stringify(testConfig),
        JSON.stringify(suiteConfig),
        { variables: { AIConfiguration: 'gemini', RequiredVar: 'value' } }
      );

      expect(result.values['AIConfiguration']).toBe('gemini');
      expect(result.sources['AIConfiguration']).toBe('run');
    });

    it('should use suite-level values over test and type defaults', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          AIConfiguration: { exposed: true, defaultValue: 'test-default' }
        }
      };

      const suiteConfig: TestSuiteVariablesConfig = {
        variables: { AIConfiguration: 'gpt4' }
      };

      const result = resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        JSON.stringify(testConfig),
        JSON.stringify(suiteConfig),
        { variables: { RequiredVar: 'value' } }
      );

      expect(result.values['AIConfiguration']).toBe('gpt4');
      expect(result.sources['AIConfiguration']).toBe('suite');
    });

    it('should use test-level defaults over type defaults', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          Temperature: { exposed: true, defaultValue: 0.5 }
        }
      };

      const result = resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        JSON.stringify(testConfig),
        null,
        { variables: { RequiredVar: 'value' } }
      );

      expect(result.values['Temperature']).toBe(0.5);
      expect(result.sources['Temperature']).toBe('test');
    });

    it('should skip variables marked as not exposed', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          AIConfiguration: { exposed: false },
          Temperature: { exposed: true }
        }
      };

      const result = resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        JSON.stringify(testConfig),
        null,
        { variables: { RequiredVar: 'value' } }
      );

      expect(result.values['AIConfiguration']).toBeUndefined();
      expect(result.values['Temperature']).toBe(0.7);
    });

    it('should respect locked variables and ignore run/suite overrides', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          AIConfiguration: { exposed: true, defaultValue: 'claude', locked: true }
        }
      };

      const suiteConfig: TestSuiteVariablesConfig = {
        variables: { AIConfiguration: 'gpt4' }
      };

      const result = resolver.resolveVariables(
        JSON.stringify(baseTypeSchema),
        JSON.stringify(testConfig),
        JSON.stringify(suiteConfig),
        { variables: { AIConfiguration: 'gemini', RequiredVar: 'value' } }
      );

      // Should use test default despite run/suite trying to override
      expect(result.values['AIConfiguration']).toBe('claude');
      expect(result.sources['AIConfiguration']).toBe('test');
    });
  });

  // ============================================================================
  // Value Validation Tests
  // ============================================================================

  describe('validateValue', () => {
    it('should accept valid static values', () => {
      const varDef = {
        name: 'Model',
        displayName: 'Model',
        dataType: 'string' as const,
        valueSource: 'static' as const,
        possibleValues: [
          { value: 'a' },
          { value: 'b' },
          { value: 'c' }
        ],
        required: false
      };

      // Should not throw
      expect(() => resolver.validateValue(varDef, undefined, 'a', 'run')).not.toThrow();
      expect(() => resolver.validateValue(varDef, undefined, 'b', 'run')).not.toThrow();
    });

    it('should reject invalid static values', () => {
      const varDef = {
        name: 'Model',
        displayName: 'Model',
        dataType: 'string' as const,
        valueSource: 'static' as const,
        possibleValues: [
          { value: 'a' },
          { value: 'b' }
        ],
        required: false
      };

      expect(() => resolver.validateValue(varDef, undefined, 'invalid', 'run'))
        .toThrow(VariableResolutionError);
    });

    it('should respect test-level restricted values', () => {
      const varDef = {
        name: 'Model',
        displayName: 'Model',
        dataType: 'string' as const,
        valueSource: 'static' as const,
        possibleValues: [
          { value: 'a' },
          { value: 'b' },
          { value: 'c' }
        ],
        required: false
      };

      const testOverride = {
        exposed: true,
        restrictedValues: ['a', 'b'] // Only a and b allowed
      };

      // 'a' should be allowed
      expect(() => resolver.validateValue(varDef, testOverride, 'a', 'run')).not.toThrow();

      // 'c' should be rejected even though it's in type possibleValues
      expect(() => resolver.validateValue(varDef, testOverride, 'c', 'run'))
        .toThrow(VariableResolutionError);
    });
  });

  describe('validateDataType', () => {
    it('should validate string type', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'string' as const, valueSource: 'freeform' as const, required: false };

      expect(() => resolver.validateDataType(varDef, 'hello')).not.toThrow();
      expect(() => resolver.validateDataType(varDef, 123)).toThrow(VariableResolutionError);
    });

    it('should validate number type', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'number' as const, valueSource: 'freeform' as const, required: false };

      expect(() => resolver.validateDataType(varDef, 123)).not.toThrow();
      expect(() => resolver.validateDataType(varDef, 0.5)).not.toThrow();
      expect(() => resolver.validateDataType(varDef, 'hello')).toThrow(VariableResolutionError);
      expect(() => resolver.validateDataType(varDef, NaN)).toThrow(VariableResolutionError);
    });

    it('should validate boolean type', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'boolean' as const, valueSource: 'freeform' as const, required: false };

      expect(() => resolver.validateDataType(varDef, true)).not.toThrow();
      expect(() => resolver.validateDataType(varDef, false)).not.toThrow();
      expect(() => resolver.validateDataType(varDef, 'true')).toThrow(VariableResolutionError);
    });

    it('should validate date type', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'date' as const, valueSource: 'freeform' as const, required: false };

      expect(() => resolver.validateDataType(varDef, new Date())).not.toThrow();
      expect(() => resolver.validateDataType(varDef, '2025-01-13')).not.toThrow();
      expect(() => resolver.validateDataType(varDef, 'not-a-date')).toThrow(VariableResolutionError);
    });
  });

  // ============================================================================
  // Available Variables Tests
  // ============================================================================

  describe('getAvailableVariables', () => {
    const typeSchema: TestTypeVariablesSchema = {
      schemaVersion: '1.0',
      variables: [
        { name: 'Var1', displayName: 'Variable 1', dataType: 'string', valueSource: 'freeform', required: false },
        { name: 'Var2', displayName: 'Variable 2', dataType: 'number', valueSource: 'freeform', defaultValue: 10, required: false },
        { name: 'Var3', displayName: 'Variable 3', dataType: 'string', valueSource: 'static', possibleValues: [{ value: 'a' }, { value: 'b' }, { value: 'c' }], required: false }
      ]
    };

    it('should return empty array for null type schema', () => {
      const result = resolver.getAvailableVariables(null, null);
      expect(result).toEqual([]);
    });

    it('should return all variables when no test config', () => {
      const result = resolver.getAvailableVariables(JSON.stringify(typeSchema), null);
      expect(result).toHaveLength(3);
    });

    it('should filter out non-exposed variables', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          Var1: { exposed: false },
          Var2: { exposed: true }
        }
      };

      const result = resolver.getAvailableVariables(
        JSON.stringify(typeSchema),
        JSON.stringify(testConfig)
      );

      expect(result).toHaveLength(2);
      expect(result.find(v => v.name === 'Var1')).toBeUndefined();
      expect(result.find(v => v.name === 'Var2')).toBeDefined();
      expect(result.find(v => v.name === 'Var3')).toBeDefined();
    });

    it('should apply test-level default overrides', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          Var2: { exposed: true, defaultValue: 20 }
        }
      };

      const result = resolver.getAvailableVariables(
        JSON.stringify(typeSchema),
        JSON.stringify(testConfig)
      );

      const var2 = result.find(v => v.name === 'Var2');
      expect(var2?.defaultValue).toBe(20);
    });

    it('should apply restricted values from test config', () => {
      const testConfig: TestVariablesConfig = {
        variables: {
          Var3: { exposed: true, restrictedValues: ['a', 'b'] }
        }
      };

      const result = resolver.getAvailableVariables(
        JSON.stringify(typeSchema),
        JSON.stringify(testConfig)
      );

      const var3 = result.find(v => v.name === 'Var3');
      expect(var3?.possibleValues).toHaveLength(2);
      expect(var3?.possibleValues?.map(pv => pv.value)).toEqual(['a', 'b']);
    });
  });

  // ============================================================================
  // CLI Parsing Tests
  // ============================================================================

  describe('parseCliValue', () => {
    it('should parse string values', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'string' as const, valueSource: 'freeform' as const, required: false };
      expect(resolver.parseCliValue(varDef, 'hello')).toBe('hello');
    });

    it('should parse number values', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'number' as const, valueSource: 'freeform' as const, required: false };
      expect(resolver.parseCliValue(varDef, '123')).toBe(123);
      expect(resolver.parseCliValue(varDef, '0.5')).toBe(0.5);
    });

    it('should throw for invalid number', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'number' as const, valueSource: 'freeform' as const, required: false };
      expect(() => resolver.parseCliValue(varDef, 'not-a-number')).toThrow(VariableResolutionError);
    });

    it('should parse boolean values', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'boolean' as const, valueSource: 'freeform' as const, required: false };
      expect(resolver.parseCliValue(varDef, 'true')).toBe(true);
      expect(resolver.parseCliValue(varDef, 'TRUE')).toBe(true);
      expect(resolver.parseCliValue(varDef, '1')).toBe(true);
      expect(resolver.parseCliValue(varDef, 'yes')).toBe(true);
      expect(resolver.parseCliValue(varDef, 'false')).toBe(false);
      expect(resolver.parseCliValue(varDef, '0')).toBe(false);
      expect(resolver.parseCliValue(varDef, 'no')).toBe(false);
    });

    it('should throw for invalid boolean', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'boolean' as const, valueSource: 'freeform' as const, required: false };
      expect(() => resolver.parseCliValue(varDef, 'maybe')).toThrow(VariableResolutionError);
    });

    it('should parse date values', () => {
      const varDef = { name: 'V', displayName: 'V', dataType: 'date' as const, valueSource: 'freeform' as const, required: false };
      const result = resolver.parseCliValue(varDef, '2025-01-13');
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).getFullYear()).toBe(2025);
    });
  });

  describe('parseCliVariables', () => {
    it('should parse name=value format', () => {
      const result = resolver.parseCliVariables(['name=value', 'other=123']);
      expect(result).toEqual({ name: 'value', other: '123' });
    });

    it('should throw for invalid format (no equals)', () => {
      expect(() => resolver.parseCliVariables(['invalid']))
        .toThrow(VariableResolutionError);
    });

    it('should handle values with equals signs', () => {
      const result = resolver.parseCliVariables(['equation=a=b+c']);
      expect(result).toEqual({ equation: 'a=b+c' });
    });

    it('should convert types when schema provided', () => {
      const schema: TestTypeVariablesSchema = {
        schemaVersion: '1.0',
        variables: [
          { name: 'num', displayName: 'Number', dataType: 'number', valueSource: 'freeform', required: false },
          { name: 'bool', displayName: 'Boolean', dataType: 'boolean', valueSource: 'freeform', required: false }
        ]
      };

      const result = resolver.parseCliVariables(
        ['num=42', 'bool=true'],
        JSON.stringify(schema)
      );

      expect(result['num']).toBe(42);
      expect(typeof result['num']).toBe('number');
      expect(result['bool']).toBe(true);
      expect(typeof result['bool']).toBe('boolean');
    });
  });
});
