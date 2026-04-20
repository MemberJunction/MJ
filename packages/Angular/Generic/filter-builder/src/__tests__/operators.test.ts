import { describe, it, expect } from 'vitest';
import {
  getOperatorsForType,
  getOperatorInfo,
  operatorRequiresValue,
  STRING_OPERATORS,
  NUMBER_OPERATORS,
  BOOLEAN_OPERATORS,
  DATE_OPERATORS,
  LOOKUP_OPERATORS
} from '../lib/types/operators';
import type { FilterFieldType } from '../lib/types/filter.types';

describe('operator constants', () => {
  it('STRING_OPERATORS should include contains and equals', () => {
    const ops = STRING_OPERATORS.map(o => o.value);
    expect(ops).toContain('contains');
    expect(ops).toContain('eq');
    expect(ops).toContain('startswith');
    expect(ops).toContain('endswith');
    expect(ops).toContain('isempty');
    expect(ops).toContain('isnotempty');
  });

  it('NUMBER_OPERATORS should include comparison operators', () => {
    const ops = NUMBER_OPERATORS.map(o => o.value);
    expect(ops).toContain('gt');
    expect(ops).toContain('gte');
    expect(ops).toContain('lt');
    expect(ops).toContain('lte');
    expect(ops).toContain('eq');
    expect(ops).toContain('isnull');
  });

  it('BOOLEAN_OPERATORS should be limited to eq, neq, and null checks', () => {
    const ops = BOOLEAN_OPERATORS.map(o => o.value);
    expect(ops).toContain('eq');
    expect(ops).toContain('neq');
    expect(ops).toContain('isnull');
    expect(ops).toContain('isnotnull');
    expect(ops).not.toContain('contains');
  });

  it('DATE_OPERATORS should include date comparison operators', () => {
    const ops = DATE_OPERATORS.map(o => o.value);
    expect(ops).toContain('gt');
    expect(ops).toContain('lt');
    expect(ops).toContain('isnull');
  });

  it('LOOKUP_OPERATORS should include string and equality ops', () => {
    const ops = LOOKUP_OPERATORS.map(o => o.value);
    expect(ops).toContain('eq');
    expect(ops).toContain('contains');
    expect(ops).toContain('isnull');
  });

  it('all operators should have label and requiresValue properties', () => {
    const allOps = [...STRING_OPERATORS, ...NUMBER_OPERATORS, ...BOOLEAN_OPERATORS, ...DATE_OPERATORS, ...LOOKUP_OPERATORS];
    for (const op of allOps) {
      expect(op).toHaveProperty('value');
      expect(op).toHaveProperty('label');
      expect(typeof op.requiresValue).toBe('boolean');
    }
  });
});

describe('getOperatorsForType', () => {
  it('should return STRING_OPERATORS for string type', () => {
    expect(getOperatorsForType('string')).toBe(STRING_OPERATORS);
  });

  it('should return NUMBER_OPERATORS for number type', () => {
    expect(getOperatorsForType('number')).toBe(NUMBER_OPERATORS);
  });

  it('should return BOOLEAN_OPERATORS for boolean type', () => {
    expect(getOperatorsForType('boolean')).toBe(BOOLEAN_OPERATORS);
  });

  it('should return DATE_OPERATORS for date type', () => {
    expect(getOperatorsForType('date')).toBe(DATE_OPERATORS);
  });

  it('should return LOOKUP_OPERATORS for lookup type', () => {
    expect(getOperatorsForType('lookup')).toBe(LOOKUP_OPERATORS);
  });

  it('should default to STRING_OPERATORS for unknown types', () => {
    expect(getOperatorsForType('custom' as FilterFieldType)).toBe(STRING_OPERATORS);
  });
});

describe('getOperatorInfo', () => {
  it('should find operator info for a valid operator', () => {
    const info = getOperatorInfo('contains', 'string');
    expect(info).toBeDefined();
    expect(info!.value).toBe('contains');
    expect(info!.label).toBe('contains');
    expect(info!.requiresValue).toBe(true);
  });

  it('should return undefined for invalid operator/type combo', () => {
    const info = getOperatorInfo('contains', 'boolean');
    expect(info).toBeUndefined();
  });

  it('should find null-check operators', () => {
    const info = getOperatorInfo('isnull', 'number');
    expect(info).toBeDefined();
    expect(info!.requiresValue).toBe(false);
  });
});

describe('operatorRequiresValue', () => {
  it('should return true for value operators', () => {
    expect(operatorRequiresValue('eq')).toBe(true);
    expect(operatorRequiresValue('contains')).toBe(true);
    expect(operatorRequiresValue('gt')).toBe(true);
    expect(operatorRequiresValue('startswith')).toBe(true);
  });

  it('should return false for null-check operators', () => {
    expect(operatorRequiresValue('isnull')).toBe(false);
    expect(operatorRequiresValue('isnotnull')).toBe(false);
    expect(operatorRequiresValue('isempty')).toBe(false);
    expect(operatorRequiresValue('isnotempty')).toBe(false);
  });
});
