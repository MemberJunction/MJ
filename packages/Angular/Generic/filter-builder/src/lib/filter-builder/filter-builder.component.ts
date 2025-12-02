import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import {
  CompositeFilterDescriptor,
  FilterDescriptor,
  FilterFieldInfo,
  FilterBuilderConfig,
  createEmptyFilter,
  isCompositeFilter
} from '../types/filter.types';

/**
 * Default configuration for the filter builder
 */
const DEFAULT_CONFIG: FilterBuilderConfig = {
  maxDepth: 3,
  allowGroups: true,
  showClearButton: true,
  showApplyButton: false,
  applyOnChange: true
};

/**
 * FilterBuilderComponent - Main filter builder component
 *
 * Provides a complete UI for building complex filter expressions
 * with AND/OR logic and nested groups. Outputs Kendo-compatible
 * CompositeFilterDescriptor JSON format.
 *
 * @example
 * ```html
 * <mj-filter-builder
 *   [fields]="filterFields"
 *   [filter]="currentFilter"
 *   (filterChange)="onFilterChange($event)"
 *   (apply)="onApply($event)">
 * </mj-filter-builder>
 * ```
 */
@Component({
  selector: 'mj-filter-builder',
  templateUrl: './filter-builder.component.html',
  styleUrls: ['./filter-builder.component.css']
})
export class FilterBuilderComponent implements OnInit, OnChanges {
  /**
   * Available fields to filter on
   */
  @Input() fields: FilterFieldInfo[] = [];

  /**
   * Current filter state (Kendo-compatible CompositeFilterDescriptor)
   */
  @Input() filter: CompositeFilterDescriptor | null = null;

  /**
   * Configuration options
   */
  @Input() config: Partial<FilterBuilderConfig> = {};

  /**
   * Whether the component is disabled
   */
  @Input() disabled: boolean = false;

  /**
   * Whether to show the natural language filter summary at the bottom
   */
  @Input() showSummary: boolean = false;

  /**
   * Emitted when the filter changes
   */
  @Output() filterChange = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * Emitted when the Apply button is clicked (if showApplyButton is true)
   */
  @Output() apply = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * Emitted when the Clear button is clicked
   */
  @Output() clear = new EventEmitter<void>();

  /**
   * Internal filter state
   */
  public internalFilter: CompositeFilterDescriptor = createEmptyFilter();

  /**
   * Merged configuration
   */
  public mergedConfig: FilterBuilderConfig = { ...DEFAULT_CONFIG };

  /**
   * Whether there are any active filters
   */
  public hasActiveFilters: boolean = false;

  ngOnInit(): void {
    this.initializeFilter();
    this.mergeConfig();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filter']) {
      this.initializeFilter();
    }
    if (changes['config']) {
      this.mergeConfig();
    }
  }

  /**
   * Initialize the internal filter state
   */
  private initializeFilter(): void {
    if (this.filter && isCompositeFilter(this.filter)) {
      this.internalFilter = this.deepCloneFilter(this.filter);
    } else {
      this.internalFilter = createEmptyFilter();
    }
    this.updateHasActiveFilters();
  }

  /**
   * Merge provided config with defaults
   */
  private mergeConfig(): void {
    this.mergedConfig = { ...DEFAULT_CONFIG, ...this.config };
  }

  /**
   * Handle filter change from the filter group
   */
  onFilterChange(filter: CompositeFilterDescriptor): void {
    this.internalFilter = filter;
    this.updateHasActiveFilters();

    if (this.mergedConfig.applyOnChange) {
      this.filterChange.emit(filter);
    }
  }

  /**
   * Handle Apply button click
   */
  onApply(): void {
    this.filterChange.emit(this.internalFilter);
    this.apply.emit(this.internalFilter);
  }

  /**
   * Handle Clear button click
   */
  onClear(): void {
    this.internalFilter = createEmptyFilter();
    this.updateHasActiveFilters();
    this.filterChange.emit(this.internalFilter);
    this.clear.emit();
  }

  /**
   * Get the count of active filter rules
   */
  getFilterCount(): number {
    return this.countFilters(this.internalFilter);
  }

  /**
   * Count filters recursively
   */
  private countFilters(filter: CompositeFilterDescriptor): number {
    let count = 0;
    for (const item of filter.filters || []) {
      if (isCompositeFilter(item)) {
        count += this.countFilters(item);
      } else {
        // Only count if the filter has a valid field and value (or null-check operators)
        const rule = item as FilterDescriptor;
        if (rule.field) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Update hasActiveFilters flag
   */
  private updateHasActiveFilters(): void {
    this.hasActiveFilters = this.getFilterCount() > 0;
  }

  /**
   * Deep clone a filter to prevent mutation
   */
  private deepCloneFilter(filter: CompositeFilterDescriptor): CompositeFilterDescriptor {
    return JSON.parse(JSON.stringify(filter));
  }

  /**
   * Generate a natural language summary of the filter expression
   */
  getFilterSummary(): string {
    if (!this.hasActiveFilters) {
      return 'No filters applied';
    }
    return this.buildFilterSummary(this.internalFilter);
  }

  /**
   * Build natural language summary recursively
   */
  private buildFilterSummary(filter: CompositeFilterDescriptor): string {
    const parts: string[] = [];

    for (const item of filter.filters || []) {
      if (isCompositeFilter(item)) {
        const groupSummary = this.buildFilterSummary(item);
        if (groupSummary) {
          parts.push(`(${groupSummary})`);
        }
      } else {
        const rule = item as FilterDescriptor;
        const ruleSummary = this.buildRuleSummary(rule);
        if (ruleSummary) {
          parts.push(ruleSummary);
        }
      }
    }

    if (parts.length === 0) {
      return '';
    }

    const connector = filter.logic === 'and' ? ' AND ' : ' OR ';
    return parts.join(connector);
  }

  /**
   * Build natural language summary for a single rule
   */
  private buildRuleSummary(rule: FilterDescriptor): string {
    if (!rule.field) {
      return '';
    }

    // Get the field display name
    const field = this.fields.find(f => f.name === rule.field);
    const fieldName = field?.displayName || rule.field;

    // Get the operator label
    const operatorLabel = this.getOperatorLabel(rule.operator);

    // Format the value
    const formattedValue = this.formatValue(rule.value, rule.operator);

    // Build the summary based on operator type
    if (this.isNullCheckOperator(rule.operator)) {
      return `${fieldName} ${operatorLabel}`;
    }

    return `${fieldName} ${operatorLabel} ${formattedValue}`;
  }

  /**
   * Check if operator is a null-check operator (doesn't need a value)
   */
  private isNullCheckOperator(operator: string): boolean {
    return ['isnull', 'isnotnull', 'isempty', 'isnotempty'].includes(operator);
  }

  /**
   * Get human-readable label for an operator
   */
  private getOperatorLabel(operator: string): string {
    const labels: Record<string, string> = {
      'eq': 'equals',
      'neq': 'does not equal',
      'contains': 'contains',
      'doesnotcontain': 'does not contain',
      'startswith': 'starts with',
      'endswith': 'ends with',
      'isnull': 'is empty',
      'isnotnull': 'is not empty',
      'isempty': 'is empty',
      'isnotempty': 'is not empty',
      'gt': 'is greater than',
      'gte': 'is greater than or equal to',
      'lt': 'is less than',
      'lte': 'is less than or equal to'
    };
    return labels[operator] || operator;
  }

  /**
   * Format a value for display in the summary
   */
  private formatValue(value: unknown, operator: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Don't show value for null-check operators
    if (this.isNullCheckOperator(operator)) {
      return '';
    }

    // Handle dates
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }

    // Handle strings
    if (typeof value === 'string') {
      return `"${value}"`;
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // Handle numbers and others
    return String(value);
  }
}
