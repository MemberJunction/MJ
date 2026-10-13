import { describe, it, expect } from 'vitest';
import {
  IsCompositeFilter,
  IsSimpleFilter,
  CreateEmptyFilter,
  CreateFilterRule,
  GetDefaultOperator,
  GetDefaultValue,
  EMPTY_FILTER
} from '../lib/types/filter.types';
import type {
  FilterDescriptor,
  CompositeFilterDescriptor,
  FilterFieldType
} from '../lib/types/filter.types';

describe('IsCompositeFilter', () => {
  it('should return true for composite filters', () => {
    const composite: CompositeFilterDescriptor = {
      logic: 'and',
      filters: []
    };
    expect(IsCompositeFilter(composite)).toBe(true);
  });

  it('should return false for simple filters', () => {
    const simple: FilterDescriptor = {
      field: 'Name',
      operator: 'eq',
      value: 'test'
    };
    expect(IsCompositeFilter(simple)).toBe(false);
  });

  it('should return true for nested composite filters', () => {
    const nested: CompositeFilterDescriptor = {
      logic: 'or',
      filters: [
        { logic: 'and', filters: [] }
      ]
    };
    expect(IsCompositeFilter(nested)).toBe(true);
  });
});

describe('IsSimpleFilter', () => {
  it('should return true for simple filters', () => {
    const simple: FilterDescriptor = {
      field: 'Status',
      operator: 'contains',
      value: 'active'
    };
    expect(IsSimpleFilter(simple)).toBe(true);
  });

  it('should return false for composite filters', () => {
    const composite: CompositeFilterDescriptor = {
      logic: 'and',
      filters: []
    };
    expect(IsSimpleFilter(composite)).toBe(false);
  });
});

describe('CreateEmptyFilter', () => {
  it('should create a filter with and logic and empty filters array', () => {
    const filter = CreateEmptyFilter();
    expect(filter.logic).toBe('and');
    expect(filter.filters).toEqual([]);
  });

  it('should create independent instances', () => {
    const f1 = CreateEmptyFilter();
    const f2 = CreateEmptyFilter();
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

describe('CreateFilterRule', () => {
  it('should create a string filter rule by default', () => {
    const rule = CreateFilterRule('Name');
    expect(rule.field).toBe('Name');
    expect(rule.operator).toBe('contains');
    expect(rule.value).toBe('');
  });

  it('should create a number filter rule', () => {
    const rule = CreateFilterRule('Age', 'number');
    expect(rule.field).toBe('Age');
    expect(rule.operator).toBe('eq');
    expect(rule.value).toBeNull();
  });

  it('should create a boolean filter rule', () => {
    const rule = CreateFilterRule('IsActive', 'boolean');
    expect(rule.operator).toBe('eq');
    expect(rule.value).toBe(true);
  });

  it('should create a date filter rule', () => {
    const rule = CreateFilterRule('CreatedAt', 'date');
    expect(rule.operator).toBe('gte');
    expect(rule.value).toBeNull();
  });

  it('should create a lookup filter rule', () => {
    const rule = CreateFilterRule('CategoryID', 'lookup');
    expect(rule.operator).toBe('eq');
    expect(rule.value).toBeNull();
  });
});

describe('GetDefaultOperator', () => {
  it('should return contains for string', () => {
    expect(GetDefaultOperator('string')).toBe('contains');
  });

  it('should return eq for number', () => {
    expect(GetDefaultOperator('number')).toBe('eq');
  });

  it('should return eq for boolean', () => {
    expect(GetDefaultOperator('boolean')).toBe('eq');
  });

  it('should return gte for date', () => {
    expect(GetDefaultOperator('date')).toBe('gte');
  });

  it('should return eq for lookup', () => {
    expect(GetDefaultOperator('lookup')).toBe('eq');
  });

  it('should return eq for unknown type', () => {
    expect(GetDefaultOperator('unknown' as FilterFieldType)).toBe('eq');
  });
});

describe('GetDefaultValue', () => {
  it('should return empty string for string', () => {
    expect(GetDefaultValue('string')).toBe('');
  });

  it('should return null for number', () => {
    expect(GetDefaultValue('number')).toBeNull();
  });

  it('should return true for boolean', () => {
    expect(GetDefaultValue('boolean')).toBe(true);
  });

  it('should return null for date', () => {
    expect(GetDefaultValue('date')).toBeNull();
  });

  it('should return null for lookup', () => {
    expect(GetDefaultValue('lookup')).toBeNull();
  });
});
