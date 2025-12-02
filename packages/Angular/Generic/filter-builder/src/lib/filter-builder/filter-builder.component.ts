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
}
