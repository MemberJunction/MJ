import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  FilterFieldInfo,
  FilterBuilderConfig,
  FilterSource,
  CreateEmptyFilter
} from '../types/filter.types';
import {
  CompositeFilter,
  CompositeFilterDescriptor,
  FilterDescriptor,
  IsCompositeFilter
} from '@memberjunction/core';

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
 * with AND/OR logic and nested groups. Outputs MJ's portable
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
   * When set (even one source), every written field is `source.key.fieldName`.
   * Several sources: two-pane field picker. One source: same JSON prefix, simpler picker.
   * Omit for legacy views that still persist bare field names.
   */
  @Input() sources: FilterSource[] | null = null;

  /**
   * Current filter state (`CompositeFilterDescriptor` from `@memberjunction/core`)
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
  public internalFilter: CompositeFilterDescriptor = CreateEmptyFilter();

  /**
   * Merged configuration
   */
  public mergedConfig: FilterBuilderConfig = { ...DEFAULT_CONFIG };

  /**
   * Whether there are any active filters
   */
  public hasActiveFilters: boolean = false;

  /**
   * Fields the rule UI binds to. When `sources` is set, names are always `key.field`.
   */
  public get effectiveFields(): FilterFieldInfo[] {
    if (this.sources?.length) {
      return this.sources.flatMap((s) =>
        (s.fields ?? []).map((f) => ({
          ...f,
          name: CompositeFilter.FormatFilterField(s.key, f.name),
          displayName: f.displayName,
        })),
      );
    }
    return this.fields;
  }

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
    if (this.filter && IsCompositeFilter(this.filter)) {
      this.internalFilter = this.deepCloneFilter(this.filter);
    } else {
      this.internalFilter = CreateEmptyFilter();
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
    this.internalFilter = CreateEmptyFilter();
    this.updateHasActiveFilters();
    this.filterChange.emit(this.internalFilter);
    this.clear.emit();
  }

  /**
   * Get the count of active filter rules
   */
  GetFilterCount(): number {
    return this.countFilters(this.internalFilter);
  }

  /**
   * Count filters recursively
   */
  private countFilters(filter: CompositeFilterDescriptor): number {
    let count = 0;
    for (const item of filter.filters || []) {
      if (IsCompositeFilter(item)) {
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
    this.hasActiveFilters = this.GetFilterCount() > 0;
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
  GetFilterSummaryHtml(): SafeHtml {
    const html = CompositeFilter.FromDescriptor(this.internalFilter).SummaryHTML({
      Fields: this.effectiveFields.map((f) => ({ Name: f.name, DisplayName: f.displayName })),
      SourceLabels: Object.fromEntries((this.sources ?? []).map((s) => [s.key, s.label])),
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
