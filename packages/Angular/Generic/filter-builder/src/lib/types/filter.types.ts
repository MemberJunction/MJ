/**
 * Filter Builder UI types.
 *
 * The filter *payload* shapes — `FilterOperator`, `FilterLogic`, `FilterDescriptor`,
 * `CompositeFilterDescriptor` and their type guards — are owned by
 * `@memberjunction/core` (`generic/filters/filter.types.ts`) and are the format
 * `UserView.FilterState` persists. Import them from there, not from here: this file
 * declares only the types the builder's UI needs on top of that payload.
 */

import type { CompositeFilterDescriptor, FilterDescriptor, FilterOperator } from '@memberjunction/core';

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
 * A record that can contribute fields to a multi-entity filter.
 * When `sources` is passed to the builder, JSON field names are always `key.name`
 * (e.g. `BillToOrganization.Type`).
 */
export interface FilterSource {
  /** Stable JSON prefix. No dots. */
  key: string;
  /** Staff-facing label (Bill-to organization). */
  label: string;
  /** Optional MJ entity name, for callers that load fields from metadata. */
  entityName?: string;
  /** Bare field names (not prefixed). */
  fields: FilterFieldInfo[];
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
export function CreateEmptyFilter(): CompositeFilterDescriptor {
  return { logic: 'and', filters: [] };
}

/**
 * Create a new filter rule with default values
 * @param field The field name to filter on
 * @param type Optional field type (defaults to 'string')
 */
export function CreateFilterRule(field: string, type: FilterFieldType = 'string'): FilterDescriptor {
  return {
    field,
    operator: GetDefaultOperator(type),
    value: GetDefaultValue(type)
  };
}

/**
 * Get the default operator for a field type
 */
export function GetDefaultOperator(type: FilterFieldType): FilterOperator {
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
export function GetDefaultValue(type: FilterFieldType): unknown {
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
