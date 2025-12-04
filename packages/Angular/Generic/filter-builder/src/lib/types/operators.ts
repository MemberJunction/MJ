/**
 * Operator Definitions - Maps field types to available operators
 */

import { FilterOperator, FilterFieldType } from './filter.types';

/**
 * Operator metadata for display in the UI
 */
export interface OperatorInfo {
  /** The operator value */
  value: FilterOperator;
  /** Display label shown in dropdown */
  label: string;
  /** Whether this operator requires a value input (false for isnull, isnotnull) */
  requiresValue: boolean;
}

/**
 * Operators available for string fields
 */
export const STRING_OPERATORS: OperatorInfo[] = [
  { value: 'contains', label: 'contains', requiresValue: true },
  { value: 'doesnotcontain', label: 'does not contain', requiresValue: true },
  { value: 'eq', label: 'equals', requiresValue: true },
  { value: 'neq', label: 'not equals', requiresValue: true },
  { value: 'startswith', label: 'starts with', requiresValue: true },
  { value: 'endswith', label: 'ends with', requiresValue: true },
  { value: 'isempty', label: 'is empty', requiresValue: false },
  { value: 'isnotempty', label: 'is not empty', requiresValue: false }
];

/**
 * Operators available for number fields
 */
export const NUMBER_OPERATORS: OperatorInfo[] = [
  { value: 'eq', label: 'equals', requiresValue: true },
  { value: 'neq', label: 'not equals', requiresValue: true },
  { value: 'gt', label: 'greater than', requiresValue: true },
  { value: 'gte', label: 'greater than or equal', requiresValue: true },
  { value: 'lt', label: 'less than', requiresValue: true },
  { value: 'lte', label: 'less than or equal', requiresValue: true },
  { value: 'isnull', label: 'is empty', requiresValue: false },
  { value: 'isnotnull', label: 'is not empty', requiresValue: false }
];

/**
 * Operators available for boolean fields
 */
export const BOOLEAN_OPERATORS: OperatorInfo[] = [
  { value: 'eq', label: 'is', requiresValue: true },
  { value: 'neq', label: 'is not', requiresValue: true },
  { value: 'isnull', label: 'is empty', requiresValue: false },
  { value: 'isnotnull', label: 'is not empty', requiresValue: false }
];

/**
 * Operators available for date fields
 */
export const DATE_OPERATORS: OperatorInfo[] = [
  { value: 'eq', label: 'equals', requiresValue: true },
  { value: 'neq', label: 'not equals', requiresValue: true },
  { value: 'gt', label: 'is after', requiresValue: true },
  { value: 'gte', label: 'is on or after', requiresValue: true },
  { value: 'lt', label: 'is before', requiresValue: true },
  { value: 'lte', label: 'is on or before', requiresValue: true },
  { value: 'isnull', label: 'is empty', requiresValue: false },
  { value: 'isnotnull', label: 'is not empty', requiresValue: false }
];

/**
 * Operators available for lookup/foreign key fields
 * Include text-based operators since users often filter by display values
 */
export const LOOKUP_OPERATORS: OperatorInfo[] = [
  { value: 'eq', label: 'equals', requiresValue: true },
  { value: 'neq', label: 'not equals', requiresValue: true },
  { value: 'contains', label: 'contains', requiresValue: true },
  { value: 'doesnotcontain', label: 'does not contain', requiresValue: true },
  { value: 'startswith', label: 'starts with', requiresValue: true },
  { value: 'endswith', label: 'ends with', requiresValue: true },
  { value: 'isnull', label: 'is empty', requiresValue: false },
  { value: 'isnotnull', label: 'is not empty', requiresValue: false }
];

/**
 * Get the available operators for a given field type
 */
export function getOperatorsForType(type: FilterFieldType): OperatorInfo[] {
  switch (type) {
    case 'string':
      return STRING_OPERATORS;
    case 'number':
      return NUMBER_OPERATORS;
    case 'boolean':
      return BOOLEAN_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    case 'lookup':
      return LOOKUP_OPERATORS;
    default:
      return STRING_OPERATORS;
  }
}

/**
 * Get operator info by value
 */
export function getOperatorInfo(operator: FilterOperator, type: FilterFieldType): OperatorInfo | undefined {
  const operators = getOperatorsForType(type);
  return operators.find(op => op.value === operator);
}

/**
 * Check if an operator requires a value input
 */
export function operatorRequiresValue(operator: FilterOperator): boolean {
  const nullOperators: FilterOperator[] = ['isnull', 'isnotnull', 'isempty', 'isnotempty'];
  return !nullOperators.includes(operator);
}
