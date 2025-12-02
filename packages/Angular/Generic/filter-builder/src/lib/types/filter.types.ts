/**
 * Filter Types - Kendo-compatible filter descriptor interfaces
 *
 * These types match the Kendo UI filter format used in UserView.FilterState
 * to ensure backward compatibility with existing saved views.
 */

/**
 * Available filter operators
 * These match the operators supported by Kendo and the GenerateWhereClause method
 */
export type FilterOperator =
  // Equality
  | 'eq'           // equals
  | 'neq'          // not equals
  // Comparison (numbers, dates)
  | 'gt'           // greater than
  | 'gte'          // greater than or equal
  | 'lt'           // less than
  | 'lte'          // less than or equal
  // String operations
  | 'contains'     // contains substring
  | 'doesnotcontain' // does not contain substring
  | 'startswith'   // starts with
  | 'endswith'     // ends with
  // Null checks
  | 'isnull'       // is null
  | 'isnotnull'    // is not null
  | 'isempty'      // is empty (alias for isnull)
  | 'isnotempty';  // is not empty (alias for isnotnull)

/**
 * Logical operators for combining filters
 */
export type FilterLogic = 'and' | 'or';

/**
 * A single filter condition (Kendo FilterDescriptor)
 */
export interface FilterDescriptor {
  /** The field name to filter on */
  field: string;
  /** The filter operator */
  operator: FilterOperator;
  /** The value to filter by (type depends on field type) */
  value: unknown;
}

/**
 * A group of filters combined with AND/OR logic (Kendo CompositeFilterDescriptor)
 * Filters can be nested to create complex expressions
 */
export interface CompositeFilterDescriptor {
  /** The logical operator to combine filters */
  logic: FilterLogic;
  /** Array of filters - can be simple FilterDescriptor or nested CompositeFilterDescriptor */
  filters: (FilterDescriptor | CompositeFilterDescriptor)[];
}

/**
 * Type guard to check if a filter is a composite (group) filter
 */
export function isCompositeFilter(
  filter: FilterDescriptor | CompositeFilterDescriptor
): filter is CompositeFilterDescriptor {
  return 'logic' in filter && 'filters' in filter;
}

/**
 * Type guard to check if a filter is a simple filter descriptor
 */
export function isSimpleFilter(
  filter: FilterDescriptor | CompositeFilterDescriptor
): filter is FilterDescriptor {
  return 'field' in filter && 'operator' in filter;
}

/**
 * Field types supported by the filter builder
 */
export type FilterFieldType = 'string' | 'number' | 'boolean' | 'date' | 'lookup';

/**
 * Metadata about a field that can be filtered
 */
export interface FilterFieldInfo {
  /** The field name (must match entity field name) */
  name: string;
  /** Display name shown in the UI */
  displayName: string;
  /** The data type of the field */
  type: FilterFieldType;
  /** For lookup fields, the entity name to look up records from */
  lookupEntityName?: string;
  /** For fields with a fixed set of values, the available options */
  valueList?: FilterValueOption[];
}

/**
 * A value option for dropdown/select fields
 */
export interface FilterValueOption {
  /** The actual value stored */
  value: string | number | boolean;
  /** The display label shown to the user */
  label: string;
}

/**
 * Configuration options for the filter builder component
 */
export interface FilterBuilderConfig {
  /** Allow nested AND/OR groups (default: true) */
  allowGroups: boolean;
  /** Maximum nesting depth for groups (default: 3) */
  maxDepth: number;
  /** Show the Clear All button (default: true) */
  showClearButton: boolean;
  /** Show the Apply button (default: false) */
  showApplyButton: boolean;
  /** Emit filterChange on every change (default: true). If false, only emits on Apply */
  applyOnChange: boolean;
  /** Show quick filter chips at the top (default: false) */
  showQuickFilters?: boolean;
  /** Predefined quick filters to show */
  quickFilters?: QuickFilterDefinition[];
  /** Show the generated filter summary at the bottom (default: false) */
  showSummary?: boolean;
  /** Show the "Add Group" button (default: true) */
  showAddGroup?: boolean;
  /** Placeholder text for empty state (default: "No filters applied") */
  emptyMessage?: string;
}

/**
 * A predefined quick filter that users can apply with one click
 */
export interface QuickFilterDefinition {
  /** Unique identifier for the quick filter */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon class (Font Awesome) */
  icon?: string;
  /** The filter to apply when clicked */
  filter: CompositeFilterDescriptor;
}

/**
 * Event emitted when the filter changes
 */
export interface FilterChangeEvent {
  /** The current filter state */
  filter: CompositeFilterDescriptor;
  /** Whether the filter is valid (all required values filled) */
  isValid: boolean;
}

/**
 * Default empty filter state
 */
export const EMPTY_FILTER: CompositeFilterDescriptor = {
  logic: 'and',
  filters: []
};

/**
 * Create a new empty filter descriptor
 */
export function createEmptyFilter(): CompositeFilterDescriptor {
  return { logic: 'and', filters: [] };
}

/**
 * Create a new filter rule with default values
 * @param field The field name to filter on
 * @param type Optional field type (defaults to 'string')
 */
export function createFilterRule(field: string, type: FilterFieldType = 'string'): FilterDescriptor {
  return {
    field,
    operator: getDefaultOperator(type),
    value: getDefaultValue(type)
  };
}

/**
 * Get the default operator for a field type
 */
export function getDefaultOperator(type: FilterFieldType): FilterOperator {
  switch (type) {
    case 'string':
      return 'contains';
    case 'number':
      return 'eq';
    case 'boolean':
      return 'eq';
    case 'date':
      return 'gte';
    case 'lookup':
      return 'eq';
    default:
      return 'eq';
  }
}

/**
 * Get the default value for a field type
 */
export function getDefaultValue(type: FilterFieldType): unknown {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return null;
    case 'boolean':
      return true;
    case 'date':
      return null;
    case 'lookup':
      return null;
    default:
      return null;
  }
}
