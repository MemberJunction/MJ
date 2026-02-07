import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
  standalone: false,
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
   * Whether the filter summary is expanded (visible)
   */
  public isSummaryExpanded: boolean = false;

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

  constructor(private sanitizer: DomSanitizer) {}

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
   * Toggle the filter summary visibility
   */
  toggleSummary(): void {
    this.isSummaryExpanded = !this.isSummaryExpanded;
  }

  /**
   * Generate HTML-formatted summary of the filter expression with syntax highlighting
   */
  getFilterSummaryHtml(): SafeHtml {
    if (!this.hasActiveFilters) {
      return this.sanitizer.bypassSecurityTrustHtml('<span style="color: #9ca3af; font-style: italic;">No filters applied</span>');
    }
    const html = this.buildFilterSummaryHtml(this.internalFilter, 0);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * Inline styles for syntax highlighting (needed because Angular view encapsulation
   * doesn't apply component CSS to dynamically injected innerHTML)
   */
  private readonly styles = {
    fieldName: 'color: #0369a1; font-weight: 600;',
    operator: 'color: #6b7280; font-style: italic;',
    valueString: 'color: #059669; font-weight: 500;',
    valueNumber: 'color: #7c3aed; font-weight: 500;',
    valueDate: 'color: #c2410c; font-weight: 500;',
    valueTrue: 'color: #16a34a; font-weight: 600;',
    valueFalse: 'color: #dc2626; font-weight: 600;',
    logicAnd: 'display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8;',
    logicOr: 'display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; background: #fef3c7; color: #b45309;',
    groupBracket: 'color: #9333ea; font-weight: 700; font-size: 15px;'
  };

  /**
   * Build HTML summary recursively with indentation and syntax highlighting
   */
  private buildFilterSummaryHtml(filter: CompositeFilterDescriptor, depth: number): string {
    const parts: string[] = [];
    const indent = '  '.repeat(depth);

    for (const item of filter.filters || []) {
      if (isCompositeFilter(item)) {
        const groupSummary = this.buildFilterSummaryHtml(item, depth + 1);
        if (groupSummary) {
          parts.push(`<span style="${this.styles.groupBracket}">(</span>\n${groupSummary}\n${indent}<span style="${this.styles.groupBracket}">)</span>`);
        }
      } else {
        const rule = item as FilterDescriptor;
        const ruleSummary = this.buildRuleSummaryHtml(rule);
        if (ruleSummary) {
          parts.push(ruleSummary);
        }
      }
    }

    if (parts.length === 0) {
      return '';
    }

    const logicStyle = filter.logic === 'and' ? this.styles.logicAnd : this.styles.logicOr;
    const logicLabel = filter.logic === 'and' ? 'AND' : 'OR';
    const connector = `\n${indent}<span style="${logicStyle}">${logicLabel}</span>\n${indent}`;

    return `${indent}${parts.join(connector)}`;
  }

  /**
   * Build HTML summary for a single rule with syntax highlighting
   */
  private buildRuleSummaryHtml(rule: FilterDescriptor): string {
    if (!rule.field) {
      return '';
    }

    // Get the field display name
    const field = this.fields.find(f => f.name === rule.field);
    const fieldName = field?.displayName || rule.field;

    // Get the operator label
    const operatorLabel = this.getOperatorLabel(rule.operator);

    // Format the value
    const formattedValue = this.formatValueHtml(rule.value, rule.operator);

    // Build the summary based on operator type
    const fieldHtml = `<span style="${this.styles.fieldName}">${this.escapeHtml(fieldName)}</span>`;
    const operatorHtml = `<span style="${this.styles.operator}">${operatorLabel}</span>`;

    if (this.isNullCheckOperator(rule.operator)) {
      return `${fieldHtml} ${operatorHtml}`;
    }

    return `${fieldHtml} ${operatorHtml} ${formattedValue}`;
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
   * Format a value for HTML display with syntax highlighting
   */
  private formatValueHtml(value: unknown, operator: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Don't show value for null-check operators
    if (this.isNullCheckOperator(operator)) {
      return '';
    }

    // Handle ISO date strings
    if (typeof value === 'string' && this.isIsoDateString(value)) {
      const date = new Date(value);
      const formatted = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      return `<span style="${this.styles.valueDate}">${formatted}</span>`;
    }

    // Handle strings
    if (typeof value === 'string') {
      return `<span style="${this.styles.valueString}">"${this.escapeHtml(value)}"</span>`;
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      const boolStyle = value ? this.styles.valueTrue : this.styles.valueFalse;
      return `<span style="${boolStyle}">${value ? 'Yes' : 'No'}</span>`;
    }

    // Handle numbers
    if (typeof value === 'number') {
      return `<span style="${this.styles.valueNumber}">${value}</span>`;
    }

    // Handle Date objects
    if (value instanceof Date) {
      const formatted = value.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      return `<span style="${this.styles.valueDate}">${formatted}</span>`;
    }

    // Default
    return `<span style="font-weight: 500;">${this.escapeHtml(String(value))}</span>`;
  }

  /**
   * Check if a string looks like an ISO date
   */
  private isIsoDateString(value: string): boolean {
    // Match ISO 8601 date format
    return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value);
  }

  /**
   * Escape HTML characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
