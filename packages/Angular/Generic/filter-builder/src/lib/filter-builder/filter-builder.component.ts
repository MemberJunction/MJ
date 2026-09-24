import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CompositeFilterDescriptor,
  FilterDescriptor,
  FilterFieldInfo,
  FilterBuilderConfig,
  FilterSource,
  CreateEmptyFilter,
  IsCompositeFilter
} from '../types/filter.types';
import { CompositeFilter } from '@memberjunction/core';

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
   * When set (even one source), every written field is `source.key.fieldName`.
   * Several sources: two-pane field picker. One source: same JSON prefix, simpler picker.
   * Omit for legacy views that still persist bare field names.
   */
  @Input() Sources: FilterSource[] | null = null;

  /** @deprecated Use {@link Sources}. */
  @Input() set sources(value: FilterSource[] | null) {
    this.Sources = value;
  }
  /** @deprecated Use {@link Sources}. */
  get sources(): FilterSource[] | null {
    return this.Sources;
  }

  /**
   * Current filter state (Kendo-compatible CompositeFilterDescriptor)
   */
  @Input() Filter: CompositeFilterDescriptor | null = null;

  /** @deprecated Use {@link Filter}. */
  @Input() set filter(value: CompositeFilterDescriptor | null) {
    this.Filter = value;
  }
  /** @deprecated Use {@link Filter}. */
  get filter(): CompositeFilterDescriptor | null {
    return this.Filter;
  }

  /**
   * Configuration options
   */
  @Input() config: Partial<FilterBuilderConfig> = {};

  /**
   * Whether the component is disabled
   */
  @Input() Disabled: boolean = false;

  /** @deprecated Use {@link Disabled}. */
  @Input() set disabled(value: boolean) {
    this.Disabled = value;
  }
  /** @deprecated Use {@link Disabled}. */
  get disabled(): boolean {
    return this.Disabled;
  }

  /**
   * Whether to show the natural language filter summary at the bottom
   */
  @Input() ShowSummary: boolean = false;

  /** @deprecated Use {@link ShowSummary}. */
  @Input() set showSummary(value: boolean) {
    this.ShowSummary = value;
  }
  /** @deprecated Use {@link ShowSummary}. */
  get showSummary(): boolean {
    return this.ShowSummary;
  }

  /**
   * Whether the filter summary is expanded (visible)
   */
  public IsSummaryExpanded: boolean = false;

  /** @deprecated Use {@link IsSummaryExpanded}. */
  public get isSummaryExpanded(): boolean {
    return this.IsSummaryExpanded;
  }
  /** @deprecated Use {@link IsSummaryExpanded}. */
  public set isSummaryExpanded(value: boolean) {
    this.IsSummaryExpanded = value;
  }

  /**
   * Emitted when the filter changes
   */
  @Output() FilterChange = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * @deprecated Use {@link FilterChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (filterChange) keeps working. Must stay AFTER FilterChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() filterChange = this.FilterChange;

  /**
   * Emitted when the Apply button is clicked (if showApplyButton is true)
   */
  @Output() Apply = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * @deprecated Use {@link Apply}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (apply) keeps working. Must stay AFTER Apply: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() apply = this.Apply;

  /**
   * Emitted when the Clear button is clicked
   */
  @Output() Clear = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Clear}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (clear) keeps working. Must stay AFTER Clear: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() clear = this.Clear;

  /**
   * Internal filter state
   */
  public InternalFilter: CompositeFilterDescriptor = CreateEmptyFilter();

  /** @deprecated Use {@link InternalFilter}. */
  public get internalFilter(): CompositeFilterDescriptor {
    return this.InternalFilter;
  }
  /** @deprecated Use {@link InternalFilter}. */
  public set internalFilter(value: CompositeFilterDescriptor) {
    this.InternalFilter = value;
  }

  /**
   * Merged configuration
   */
  public MergedConfig: FilterBuilderConfig = { ...DEFAULT_CONFIG };

  /** @deprecated Use {@link MergedConfig}. */
  public get mergedConfig(): FilterBuilderConfig {
    return this.MergedConfig;
  }
  /** @deprecated Use {@link MergedConfig}. */
  public set mergedConfig(value: FilterBuilderConfig) {
    this.MergedConfig = value;
  }

  /**
   * Whether there are any active filters
   */
  public HasActiveFilters: boolean = false;

  /** @deprecated Use {@link HasActiveFilters}. */
  public get hasActiveFilters(): boolean {
    return this.HasActiveFilters;
  }
  /** @deprecated Use {@link HasActiveFilters}. */
  public set hasActiveFilters(value: boolean) {
    this.HasActiveFilters = value;
  }

  /**
   * Fields the rule UI binds to. When `sources` is set, names are always `key.field`.
   */
  public get EffectiveFields(): FilterFieldInfo[] {
    if (this.Sources?.length) {
      return this.Sources.flatMap((s) =>
        (s.fields ?? []).map((f) => ({
          ...f,
          name: CompositeFilter.FormatFilterField(s.key, f.name),
          displayName: f.displayName,
        })),
      );
    }
    return this.fields;
  }

  /** @deprecated Use {@link EffectiveFields}. */
  public get effectiveFields(): FilterFieldInfo[] {
    return this.EffectiveFields;
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
    if (this.Filter && IsCompositeFilter(this.Filter)) {
      this.InternalFilter = this.deepCloneFilter(this.Filter);
    } else {
      this.InternalFilter = CreateEmptyFilter();
    }
    this.updateHasActiveFilters();
  }

  /**
   * Merge provided config with defaults
   */
  private mergeConfig(): void {
    this.MergedConfig = { ...DEFAULT_CONFIG, ...this.config };
  }

  /**
   * Handle filter change from the filter group
   */
  onFilterChange(filter: CompositeFilterDescriptor): void {
    this.InternalFilter = filter;
    this.updateHasActiveFilters();

    if (this.MergedConfig.applyOnChange) {
      this.FilterChange.emit(filter);
    }
  }

  /**
   * Handle Apply button click
   */
  OnApply(): void {
    this.FilterChange.emit(this.InternalFilter);
    this.Apply.emit(this.InternalFilter);
  }

  /** @deprecated Use {@link OnApply}. */
  onApply(): void {
    return this.OnApply();
  }

  /**
   * Handle Clear button click
   */
  OnClear(): void {
    this.InternalFilter = CreateEmptyFilter();
    this.updateHasActiveFilters();
    this.FilterChange.emit(this.InternalFilter);
    this.Clear.emit();
  }

  /** @deprecated Use {@link OnClear}. */
  onClear(): void {
    return this.OnClear();
  }

  /**
   * Get the count of active filter rules
   */
  GetFilterCount(): number {
    return this.countFilters(this.InternalFilter);
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
    this.HasActiveFilters = this.GetFilterCount() > 0;
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
  ToggleSummary(): void {
    this.IsSummaryExpanded = !this.IsSummaryExpanded;
  }

  /** @deprecated Use {@link ToggleSummary}. */
  toggleSummary(): void {
    return this.ToggleSummary();
  }

  /**
   * Generate HTML-formatted summary of the filter expression with syntax highlighting
   */
  GetFilterSummaryHtml(): SafeHtml {
    const html = CompositeFilter.FromDescriptor(this.InternalFilter).SummaryHTML({
      Fields: this.EffectiveFields.map((f) => ({ Name: f.name, DisplayName: f.displayName })),
      SourceLabels: Object.fromEntries((this.Sources ?? []).map((s) => [s.key, s.label])),
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
