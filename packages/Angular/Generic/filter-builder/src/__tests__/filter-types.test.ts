import { describe, it, expect } from 'vitest';
import {
  isCompositeFilter,
  isSimpleFilter,
  createEmptyFilter,
  createFilterRule,
  getDefaultOperator,
  getDefaultValue,
  EMPTY_FILTER
} from '../lib/types/filter.types';
import type {
  FilterDescriptor,
  CompositeFilterDescriptor,
  FilterFieldType
} from '../lib/types/filter.types';

describe('isCompositeFilter', () => {
  it('should return true for composite filters', () => {
    const composite: CompositeFilterDescriptor = {
      logic: 'and',
      filters: []
    };
    expect(isCompositeFilter(composite)).toBe(true);
  });

  it('should return false for simple filters', () => {
    const simple: FilterDescriptor = {
      field: 'Name',
      operator: 'eq',
      value: 'test'
    };
    expect(isCompositeFilter(simple)).toBe(false);
  });

  it('should return true for nested composite filters', () => {
    const nested: CompositeFilterDescriptor = {
      logic: 'or',
      filters: [
        { logic: 'and', filters: [] }
      ]
    };
    expect(isCompositeFilter(nested)).toBe(true);
  });
});

describe('isSimpleFilter', () => {
  it('should return true for simple filters', () => {
    const simple: FilterDescriptor = {
      field: 'Status',
      operator: 'contains',
      value: 'active'
    };
    expect(isSimpleFilter(simple)).toBe(true);
  });

  it('should return false for composite filters', () => {
    const composite: CompositeFilterDescriptor = {
      logic: 'and',
      filters: []
    };
    expect(isSimpleFilter(composite)).toBe(false);
  });
});

describe('createEmptyFilter', () => {
  it('should create a filter with and logic and empty filters array', () => {
    const filter = createEmptyFilter();
    expect(filter.logic).toBe('and');
    expect(filter.filters).toEqual([]);
  });

  it('should create independent instances', () => {
    const f1 = createEmptyFilter();
    const f2 = createEmptyFilter();
    f1.filters.push({ field: 'test', operator: 'eq', value: 1 });
    expect(f2.filters).toHaveLength(0);
  });
});

describe('EMPTY_FILTER', () => {
  it('should have and logic and empty filters', () => {
    expect(EMPTY_FILTER.logic).toBe('and');
    expect(EMPTY_FILTER.filters).toEqual([]);
  });
});

describe('createFilterRule', () => {
  it('should create a string filter rule by default', () => {
    const rule = createFilterRule('Name');
    expect(rule.field).toBe('Name');
    expect(rule.operator).toBe('contains');
    expect(rule.value).toBe('');
  });

  it('should create a number filter rule', () => {
    const rule = createFilterRule('Age', 'number');
    expect(rule.field).toBe('Age');
    expect(rule.operator).toBe('eq');
    expect(rule.value).toBeNull();
  });

  it('should create a boolean filter rule', () => {
    const rule = createFilterRule('IsActive', 'boolean');
    expect(rule.operator).toBe('eq');
    expect(rule.value).toBe(true);
  });

  it('should create a date filter rule', () => {
    const rule = createFilterRule('CreatedAt', 'date');
    expect(rule.operator).toBe('gte');
    expect(rule.value).toBeNull();
  });

  it('should create a lookup filter rule', () => {
    const rule = createFilterRule('CategoryID', 'lookup');
    expect(rule.operator).toBe('eq');
    expect(rule.value).toBeNull();
  });
});

describe('getDefaultOperator', () => {
  it('should return contains for string', () => {
    expect(getDefaultOperator('string')).toBe('contains');
  });

  it('should return eq for number', () => {
    expect(getDefaultOperator('number')).toBe('eq');
  });

  it('should return eq for boolean', () => {
    expect(getDefaultOperator('boolean')).toBe('eq');
  });

  it('should return gte for date', () => {
    expect(getDefaultOperator('date')).toBe('gte');
  });

  it('should return eq for lookup', () => {
    expect(getDefaultOperator('lookup')).toBe('eq');
  });

  it('should return eq for unknown type', () => {
    expect(getDefaultOperator('unknown' as FilterFieldType)).toBe('eq');
  });
});

describe('getDefaultValue', () => {
  it('should return empty string for string', () => {
    expect(getDefaultValue('string')).toBe('');
  });

  it('should return null for number', () => {
    expect(getDefaultValue('number')).toBeNull();
  });

  it('should return true for boolean', () => {
    expect(getDefaultValue('boolean')).toBe(true);
  });

  it('should return null for date', () => {
    expect(getDefaultValue('date')).toBeNull();
  });

  it('should return null for lookup', () => {
    expect(getDefaultValue('lookup')).toBeNull();
  });
});
