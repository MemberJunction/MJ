import { Component, Input, Output, EventEmitter, OnInit, HostListener } from '@angular/core';
import { CompositeFilterDescriptor, FilterFieldInfo, createEmptyFilter } from '@memberjunction/ng-filter-builder';

/**
 * FilterDialogComponent - Modal dialog for editing filters
 *
 * Provides a full-width editing experience for the filter builder,
 * suitable for complex filter expressions.
 */
@Component({
  standalone: false,
  selector: 'mj-filter-dialog',
  templateUrl: './filter-dialog.component.html',
  styleUrls: ['./filter-dialog.component.css']
})
export class FilterDialogComponent implements OnInit {
  /**
   * Whether the dialog is open
   */
  @Input() isOpen: boolean = false;

  /**
   * Available fields to filter on
   */
  @Input() fields: FilterFieldInfo[] = [];

  /**
   * Current filter state
   */
  @Input() filter: CompositeFilterDescriptor = createEmptyFilter();

  /**
   * Whether the filter builder is disabled (read-only mode)
   */
  @Input() disabled: boolean = false;

  /**
   * Emitted when the dialog should close
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Emitted when the filter is applied
   */
  @Output() apply = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * Internal working copy of the filter
   */
  public workingFilter: CompositeFilterDescriptor = createEmptyFilter();

  /**
   * Handle Escape key to close dialog
   */
  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.isOpen) {
      this.onCancel();
    }
  }

  ngOnInit(): void {
    this.initializeWorkingFilter();
  }

  /**
   * Initialize working filter when input changes
   */
  ngOnChanges(): void {
    if (this.isOpen) {
      this.initializeWorkingFilter();
    }
  }

  /**
   * Create a working copy of the filter
   */
  private initializeWorkingFilter(): void {
    // Deep clone to avoid mutating the original
    this.workingFilter = JSON.parse(JSON.stringify(this.filter || createEmptyFilter()));
  }

  /**
   * Handle filter changes from the filter builder
   */
  onFilterChange(filter: CompositeFilterDescriptor): void {
    this.workingFilter = filter;
  }

  /**
   * Apply the filter and close
   */
  onApply(): void {
    this.apply.emit(this.workingFilter);
    this.close.emit();
  }

  /**
   * Cancel and close without saving
   */
  onCancel(): void {
    this.close.emit();
  }

  /**
   * Clear all filters
   */
  onClear(): void {
    this.workingFilter = createEmptyFilter();
  }

  /**
   * Get filter count for display
   */
  getFilterCount(): number {
    return this.countFilters(this.workingFilter);
  }

  /**
   * Count filters recursively
   */
  private countFilters(filter: CompositeFilterDescriptor): number {
    let count = 0;
    for (const item of filter.filters || []) {
      if ('logic' in item && 'filters' in item) {
        count += this.countFilters(item as CompositeFilterDescriptor);
      } else if ('field' in item) {
        count++;
      }
    }
    return count;
  }
}
